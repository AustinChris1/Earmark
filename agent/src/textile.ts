import { randomBytes } from "node:crypto";
import { concat, type Address, type Hex } from "viem";
import { account, ERC20_ABI, publicClient, tagSuffix, walletClient } from "./chain.js";
import { CELO_CHAIN_ID } from "./config.js";

/**
 * Textile FX on Celo: a request-for-quote venue where makers quote an exact size and the taker
 * settles it on chain. No API key is needed; the taker proves control of its wallet with a
 * signature. The bought tokens are delivered to the taker, so for a cross-currency drive the agent
 * is the taker and forwards the result into the drive itself.
 *
 * Spec: https://docs.textilecredit.com/openapi-v2.json
 */

const BASE = process.env.TEXTILE_API ?? "https://api.textilecredit.com/v2";
// Firm requests can block while makers reply, up to ~70s on a cold corridor; the spec asks for a longer client timeout.
const FIRM_TIMEOUT_MS = 75_000;

export type QuoteSize = { sellAmount: bigint; buyAmount?: never } | { buyAmount: bigint; sellAmount?: never };

export type Preview = {
  sellAmount: bigint;
  buyAmount: bigint;
  feeAmount: bigint;
  /** What the taker actually spends: the sell amount plus the venue fee. */
  takerPays: bigint;
  /** Published depth on the sell side, useful when a size is refused. */
  available?: bigint;
};

type UnsignedTx = { to: Address; data: Hex; value: string; chainId: number };

export type FirmQuote = Preview & {
  rfqId: string;
  claimToken: string;
  expiresAt: Date;
  spender: Address;
  approval: UnsignedTx;
  swap: UnsignedTx;
};

export class TextileError extends Error {
  constructor(
    message: string,
    readonly reason?: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

function sizeBody(size: QuoteSize) {
  return size.sellAmount !== undefined
    ? { sellAmount: size.sellAmount.toString() }
    : { buyAmount: size.buyAmount!.toString() };
}

async function call<T>(path: string, init: RequestInit & { timeoutMs?: number; claim?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.claim) headers["X-Rfq-Claim"] = init.claim;
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
  });
  const body = (await r.json().catch(() => ({}))) as { data?: T; error?: { message?: string; details?: { reason?: string } } };
  if (!r.ok || !body.data) {
    throw new TextileError(body.error?.message ?? `Textile ${path} returned ${r.status}`, body.error?.details?.reason, r.status);
  }
  return body.data;
}

/** An indicative price from published levels. Anonymous, reserves nothing. */
export async function preview(sellToken: Address, buyToken: Address, size: QuoteSize): Promise<Preview> {
  const d = await call<{
    sellAmount: string;
    buyAmount: string;
    feeAmount: string;
    takerPays: string;
    availableSellAmount?: string;
  }>("/rfq/preview", {
    method: "POST",
    body: JSON.stringify({ chainId: CELO_CHAIN_ID, sellToken, buyToken, ...sizeBody(size) }),
  });
  return {
    sellAmount: BigInt(d.sellAmount),
    buyAmount: BigInt(d.buyAmount),
    feeAmount: BigInt(d.feeAmount),
    takerPays: BigInt(d.takerPays),
    available: d.availableSellAmount ? BigInt(d.availableSellAmount) : undefined,
  };
}

/** The personal_sign text the spec defines for a taker proof, with address and nonce lowercased. */
export function takerControlText(taker: Address, chainId: number, nonce: Hex, issuedAt: number): string {
  return [
    "Textile Taker Control",
    "Version: 1",
    "",
    "Sign to prove you control this wallet so Textile can request a firm",
    "quote for it. This does not approve any transfer, trade or allowance.",
    "",
    `Wallet: ${taker.toLowerCase()}`,
    `Chain: ${chainId}`,
    `Nonce: ${nonce.toLowerCase()}`,
    `Issued at: ${issuedAt}`,
  ].join("\n");
}

async function takerProof() {
  const nonce = `0x${randomBytes(32).toString("hex")}` as Hex;
  const issuedAt = Date.now();
  const signature = await account.signMessage({
    message: takerControlText(account.address, CELO_CHAIN_ID, nonce, issuedAt),
  });
  return { nonce, issuedAt, signature, scheme: "eip191" as const };
}

/**
 * A firm, agent-bound quote with ready-to-broadcast calldata. It reserves maker liquidity until it
 * expires (about 60s), so a quote that will not be used should be cancelled.
 */
export async function requestFirm(sellToken: Address, buyToken: Address, size: QuoteSize): Promise<FirmQuote> {
  const d = await call<{
    rfqId: string;
    claimToken: string;
    status: "quoted" | "no_quote";
    reason?: string;
    quote?: {
      sellAmount: string;
      buyAmount: string;
      feeAmount: string;
      takerPays: string;
      expiresAt: string;
      spender: Address;
    };
    transactions?: { approval: UnsignedTx; swap: UnsignedTx };
  }>("/rfq/request", {
    method: "POST",
    timeoutMs: FIRM_TIMEOUT_MS,
    body: JSON.stringify({
      chainId: CELO_CHAIN_ID,
      sellToken,
      buyToken,
      ...sizeBody(size),
      taker: account.address,
      takerProof: await takerProof(),
    }),
  });
  if (d.status !== "quoted" || !d.quote || !d.transactions) {
    throw new TextileError(`No quote: ${d.reason ?? "unknown"}`, d.reason);
  }
  return {
    rfqId: d.rfqId,
    claimToken: d.claimToken,
    sellAmount: BigInt(d.quote.sellAmount),
    buyAmount: BigInt(d.quote.buyAmount),
    feeAmount: BigInt(d.quote.feeAmount),
    takerPays: BigInt(d.quote.takerPays),
    expiresAt: new Date(d.quote.expiresAt),
    spender: d.quote.spender,
    approval: d.transactions.approval,
    swap: d.transactions.swap,
  };
}

export async function cancel(q: Pick<FirmQuote, "rfqId" | "claimToken">): Promise<void> {
  await call(`/rfq/${q.rfqId}/cancel`, { method: "POST", claim: q.claimToken, body: "{}" }).catch(() => {});
}

// Our attribution tag rides on the end of Textile's calldata, the same way it does on every other
// agent transaction; trailing bytes after the ABI arguments are ignored by the contract.
function tagged(data: Hex): Hex {
  return tagSuffix ? concat([data, tagSuffix]) : data;
}

async function send(tx: UnsignedTx): Promise<Hex> {
  if (tx.chainId !== CELO_CHAIN_ID) throw new TextileError(`Quote is for chain ${tx.chainId}, not Celo`);
  const hash = await walletClient.sendTransaction({
    to: tx.to,
    data: tagged(tx.data),
    value: BigInt(tx.value),
    // Gas in CELO: the dollars in the agent wallet belong to the payer until the swap.
  } as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new TextileError(`Transaction ${hash} reverted`);
  return hash;
}

/**
 * Settles a firm quote from the agent wallet: approves the spender if the standing allowance does
 * not cover it, swaps, and reports the settlement back to Textile. Returns how much of the buy
 * token actually arrived, measured from the balance rather than trusted from the quote.
 */
export async function execute(q: FirmQuote, sellToken: Address, buyToken: Address): Promise<{ swapHash: Hex; received: bigint }> {
  if (q.expiresAt.getTime() < Date.now()) throw new TextileError("Quote expired before it could be executed", "expired");
  const allowance = await publicClient.readContract({
    address: sellToken,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, q.spender],
  });
  if (allowance < q.takerPays) await send(q.approval);

  const before = await publicClient.readContract({ address: buyToken, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] });
  const swapHash = await send(q.swap);
  const after = await publicClient.readContract({ address: buyToken, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] });
  await call(`/rfq/${q.rfqId}/submit`, { method: "POST", claim: q.claimToken, body: JSON.stringify({ txHash: swapHash }) }).catch(
    (e) => console.error("textile submit:", (e as Error).message),
  );
  return { swapHash, received: after - before };
}
