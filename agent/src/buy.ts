import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { formatUnits } from "viem";
import { account, ERC20_ABI, publicClient } from "./chain.js";
import { env, tokenBySymbol } from "./config.js";
import { buySpentSince, pendingIntents, recordBuyCall } from "./db.js";

/**
 * buy (usebuy.ai) is Celo's marketplace of paid services for agents. Earmark uses it for what it
 * does not run itself: the language model that reads a drive typed as a sentence, and a Celo
 * node to fall back on when its own RPC fails. Each call is paid from the agent wallet over x402,
 * one EIP-3009 authorisation per request, with no account or API key.
 *
 * The agent wallet also holds other people's money (bill pools, swaps in flight), so buy is paid
 * in one coin only, USDC by default, which no bill or swap uses; the price must match what the
 * catalogue says the service costs; and spending is capped per day. Past the cap, buy is simply
 * not used and Earmark falls back to its own keys and nodes.
 *
 * https://usebuy.ai/docs, catalogue at https://gateway.usebuy.ai/v1/catalog
 */

export const BUY_GATEWAY = env.BUY_GATEWAY;
const DAY = 86_400;

/** What each service Earmark uses costs, from the catalogue; a 402 asking for more is refused. */
export const BUY_SERVICES = {
  "cencori.chat": { url: `${BUY_GATEWAY}/cencori/v1/chat/completions`, max: 10_000n },
  "chainstack.celo": { url: `${BUY_GATEWAY}/chainstack/celo`, max: 10_000n },
} as const;
export type BuyService = keyof typeof BUY_SERVICES;

function coin() {
  return tokenBySymbol(env.BUY_TOKEN);
}

/** The daily cap in the buy coin's atomic units; zero turns buy off. */
function dailyCap(): bigint {
  const c = coin();
  if (!c) return 0n;
  const usd = Number(env.BUY_DAILY_USD);
  if (!Number.isFinite(usd) || usd <= 0) return 0n;
  return BigInt(Math.round(usd * 10 ** c.decimals));
}

export function buyEnabled(): boolean {
  return dailyCap() > 0n;
}

type Requirement = { asset?: string; amount?: string; maxAmountRequired?: string };
const priceOf = (r: Requirement) => BigInt(r.maxAmountRequired ?? r.amount ?? "0");

/**
 * Keeps only the 402 options Earmark is willing to sign: its buy coin, at no more than `max`.
 * Exported for tests.
 */
export function affordable<R extends Requirement>(accepts: R[], asset: string, max: bigint): R[] {
  return accepts.filter((r) => r.asset?.toLowerCase() === asset.toLowerCase() && priceOf(r) > 0n && priceOf(r) <= max);
}

// Built on first use: chain.ts imports this file for its RPC fallback, so `account` is not ready
// while the modules are still loading.
let client: x402HTTPClient | undefined;
let maxForCall = 0n;
function http(): x402HTTPClient {
  if (client) return client;
  const policy = (_v: number, accepts: Requirement[]) => affordable(accepts, coin()!.address, maxForCall);
  client = new x402HTTPClient(
    registerExactEvmScheme(new x402Client().setSpendControls(false), { signer: account, policies: [policy as never] }),
  );
  return client;
}

/**
 * What the agent holds in the buy coin, less x402 shares in that coin still waiting to be forwarded
 * into their drives: that money belongs to the people who sent it.
 */
async function spareBalance(asset: `0x${string}`): Promise<bigint> {
  const held = await publicClient.readContract({ address: asset, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] });
  const owed = (await pendingIntents())
    .filter((i) => i.token.toLowerCase() === asset.toLowerCase())
    .reduce((a, i) => a + BigInt(i.amount), 0n);
  return held > owed ? held - owed : 0n;
}

// One paid call at a time, so the daily cap is checked against everything already signed.
let queue: Promise<unknown> = Promise.resolve();

export class BuyUnavailable extends Error {}

/**
 * Sends `init` to a buy service and pays its 402 from the agent wallet. Returns the paid response.
 * Throws BuyUnavailable when buy is off, the day's budget is spent, or the price is not what the
 * catalogue says; the caller then uses its own fallback.
 */
export function buyFetch(service: BuyService, init: RequestInit & { timeoutMs?: number }, url?: string): Promise<Response> {
  const run = async () => {
    const c = coin();
    const cap = dailyCap();
    if (!c || cap === 0n) throw new BuyUnavailable("buy is off");
    const { max } = BUY_SERVICES[service];
    const target = url ?? BUY_SERVICES[service].url;
    const spent = await buySpentSince(c.symbol, Math.floor(Date.now() / 1000) - DAY);
    if (spent + max > cap) throw new BuyUnavailable(`buy budget for today is spent (${formatUnits(spent, c.decimals)} ${c.symbol})`);

    const send = (headers: Record<string, string> = {}) =>
      fetch(target, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string> | undefined), ...headers },
        signal: AbortSignal.timeout(init.timeoutMs ?? 60_000),
      });

    // Reads for the paid node cannot use the node that just failed; the cap bounds that path.
    if (service !== "chainstack.celo") {
      const spare = await spareBalance(c.address);
      if (spare < max) throw new BuyUnavailable(`the agent wallet has ${formatUnits(spare, c.decimals)} ${c.symbol} spare for buy`);
    }

    const first = await send();
    if (first.status !== 402) return first;

    const h = http();
    const required = h.getPaymentRequiredResponse((n) => first.headers.get(n), await first.json().catch(() => undefined));
    const options = affordable(required.accepts as Requirement[], c.address, max);
    if (!options.length) throw new BuyUnavailable(`${service} did not offer ${c.symbol} at or under ${formatUnits(max, c.decimals)}`);
    maxForCall = max;
    const signed = await h.createPaymentPayload(required);
    // The policy leaves only `options`, and the client signs the first of them.
    const price = priceOf(options[0]);

    let paid: Response;
    try {
      paid = await send(h.encodePaymentSignatureHeader(signed));
    } catch (e) {
      // A signature is out: count it against the budget even though no answer came back.
      await recordBuyCall({ service, amount: price.toString(), token: c.symbol, tx: null, ok: 0, note: (e as Error).message });
      throw e;
    }
    let tx: string | null = null;
    try {
      tx = h.getPaymentSettleResponse((n) => paid.headers.get(n)).transaction || null;
    } catch {
      // No settlement header: the gateway refused or failed before settling.
    }
    await recordBuyCall({
      service,
      amount: price.toString(),
      token: c.symbol,
      tx,
      ok: paid.ok ? 1 : 0,
      note: paid.ok ? null : `HTTP ${paid.status}`,
    });
    return paid;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

/**
 * A fetch for viem's http transport that buys Celo JSON-RPC from Chainstack through buy. viem
 * batches the calls, and one payment covers a batch of up to 2,000.
 */
export async function buyRpcFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return buyFetch("chainstack.celo", { ...init, timeoutMs: 30_000 }, url);
}
