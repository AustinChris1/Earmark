import type { Address, Hex } from "viem";
import { tokenByAddress, tokenBySymbol, type TokenInfo } from "./config.js";

/**
 * Paying a drive in a coin it was not opened in. The payer sends what they hold (pesos as wARS,
 * reais as wBRL, naira as cNGN, or dollars); the agent swaps it on Textile FX into the drive's coin
 * and contributes that, so the payee only ever receives the coin the drive names and the destination
 * is still the one locked at creation. An aunt in Buenos Aires can chip into a Lagos light bill.
 *
 * The money sits in the agent wallet for the seconds the swap takes. The payer is shown the most
 * they will spend; if the market moves past it, or any step fails before the drive is paid, it goes
 * back to the address it came from.
 */

/** Textile's live corridors on Celo, one direction each. Anything else goes through USDT. */
const DIRECT = new Set([
  "USDT>cNGN", "cNGN>USDT",
  "USDT>wARS", "wARS>USDT",
  "USDT>wBRL", "wBRL>USDT",
  "USDC>USDT", "USDT>USDC",
  // USA₮ only goes one way: there is no corridor into it, so a USA₮ drive can only be paid in USA₮.
  "USAT>USDT",
]);

/** Coins a payer can send to be swapped. */
export const PAY_COINS = ["USDT", "USAT", "cNGN", "wARS", "wBRL"] as const;

/** Headroom over the quoted price that the payer is asked to send; the unused part is refunded. */
export const HEADROOM_BPS = 100n;

const symbolOf = (a: Address) => tokenByAddress(a)?.symbol ?? "";

export function isDirect(sell: Address, buy: Address): boolean {
  return DIRECT.has(`${symbolOf(sell)}>${symbolOf(buy)}`);
}

/** How Earmark turns `pay` into the drive's coin: one swap, two via USDT, or not at all. */
export function routeFor(pay: TokenInfo | undefined, drive: TokenInfo | undefined): "direct" | "via-usdt" | null {
  if (!pay || !drive || pay.symbol === drive.symbol) return null;
  if (!(PAY_COINS as readonly string[]).includes(pay.symbol)) return null;
  if (DIRECT.has(`${pay.symbol}>${drive.symbol}`)) return "direct";
  if (drive.symbol !== "USDT" && DIRECT.has(`${pay.symbol}>USDT`) && DIRECT.has(`USDT>${drive.symbol}`)) return "via-usdt";
  return null;
}

/** The coins, other than its own, that a drive in `drive` can be paid in. */
export function payOptions(drive: TokenInfo | undefined): string[] {
  return PAY_COINS.filter((p) => routeFor(tokenBySymbol(p), drive));
}

export function withHeadroom(amount: bigint): bigint {
  return amount + (amount * HEADROOM_BPS + 9_999n) / 10_000n;
}

/**
 * How much local coin to buy: the payer's requested share, never more than the drive still needs,
 * because the contract rejects a contribution that would pass the target.
 */
export function localToBuy(requested: bigint, target: bigint, raised: bigint): bigint {
  if (target === 0n) return requested;
  const remaining = target > raised ? target - raised : 0n;
  return requested < remaining ? requested : remaining;
}

export type IntentStatus = "received" | "swapping" | "contributed" | "refunded" | "failed";

export type CorridorIntent = {
  id: string;
  drive_id: number;
  payer: Address;
  pay_token: Address;
  pay_amount: bigint;
  pay_tx: Hex;
  /** The local amount the payer asked to put in. */
  want_local: bigint;
  memo: string;
  status: IntentStatus;
};

type Firm = { buyAmount: bigint; takerPays: bigint; expiresAt: Date };

/** Everything that touches the network, injected so the decision logic can be tested on its own. */
export type CorridorDeps<Q extends Firm> = {
  readDrive(id: number): Promise<{ token: Address; target: bigint; raised: bigint; closed: boolean }>;
  usdt: Address;
  usat: Address;
  firmExactIn(sell: Address, buy: Address, sellAmount: bigint): Promise<Q>;
  firmExactOut(sell: Address, buy: Address, buyAmount: bigint): Promise<Q>;
  execute(q: Q, sell: Address, buy: Address): Promise<{ swapHash: Hex; received: bigint }>;
  cancel(q: Q): Promise<void>;
  contribute(driveId: number, token: Address, amount: bigint, memo: string): Promise<Hex>;
  refund(token: Address, to: Address, amount: bigint): Promise<Hex>;
  setStatus(id: string, status: IntentStatus, fields?: Record<string, string>): Promise<void>;
};

export type CorridorResult =
  | { status: "contributed"; contributeTx: Hex; swapTx: Hex; local: bigint; refundTx?: Hex; refunded?: bigint }
  | { status: "refunded"; refundTx: Hex; refunded: bigint; reason: string };

/**
 * Runs one paid intent to completion. Every path ends either with the drive paid (and any unused
 * dollars returned) or with the dollars returned in full.
 */
export async function settle<Q extends Firm>(intent: CorridorIntent, deps: CorridorDeps<Q>): Promise<CorridorResult> {
  // What the agent is currently holding on the payer's behalf, and in which coin.
  let heldToken = intent.pay_token;
  let held = intent.pay_amount;

  const giveBack = async (reason: string): Promise<CorridorResult> => {
    const refundTx = await deps.refund(heldToken, intent.payer, held);
    await deps.setStatus(intent.id, "refunded", { refund_tx: refundTx, note: reason });
    return { status: "refunded", refundTx, refunded: held, reason };
  };

  const drive = await deps.readDrive(intent.drive_id);
  if (!routeFor(tokenByAddress(heldToken), tokenByAddress(drive.token))) {
    return giveBack("Earmark cannot swap that coin into this drive's coin.");
  }
  if (drive.closed) return giveBack("The drive closed before the payment could be swapped.");
  const want = localToBuy(intent.want_local, drive.target, drive.raised);
  if (want === 0n) return giveBack("The drive is already full.");

  await deps.setStatus(intent.id, "swapping");

  // Local coin already bought but not yet in the drive; if that last step fails, it goes back too.
  let bought: { swapHash: Hex; received: bigint } | undefined;

  try {
    // No direct corridor (USA₮ into naira, pesos into naira): all of it becomes USDT first.
    if (!isDirect(heldToken, drive.token)) {
      const hop = await deps.firmExactIn(heldToken, deps.usdt, held);
      const { received } = await deps.execute(hop, heldToken, deps.usdt);
      heldToken = deps.usdt;
      held = received;
    }

    const q = await deps.firmExactOut(heldToken, drive.token, want);
    if (q.takerPays > held) {
      // The market moved past the most the payer agreed to spend.
      await deps.cancel(q);
      return giveBack("The rate moved past the most you agreed to pay, so nothing was swapped.");
    }
    bought = await deps.execute(q, heldToken, drive.token);
    held -= q.takerPays;
    const { swapHash, received } = bought;

    const contributeTx = await deps.contribute(intent.drive_id, drive.token, received, intent.memo);
    let refundTx: Hex | undefined;
    if (held > 0n) refundTx = await deps.refund(heldToken, intent.payer, held);
    await deps.setStatus(intent.id, "contributed", {
      swap_tx: swapHash,
      contribute_tx: contributeTx,
      local_amount: received.toString(),
      ...(refundTx ? { refund_tx: refundTx } : {}),
    });
    return { status: "contributed", contributeTx, swapTx: swapHash, local: received, refundTx, refunded: refundTx ? held : undefined };
  } catch (e) {
    const reason = `${bought ? "Paying the drive" : "Swap"} failed: ${(e as Error).message}`;
    try {
      if (bought) {
        // The swap went through but the drive did not take it: return the local coin as well as any change.
        const localTx = await deps.refund(drive.token, intent.payer, bought.received);
        if (held > 0n) await deps.refund(heldToken, intent.payer, held);
        await deps.setStatus(intent.id, "refunded", { swap_tx: bought.swapHash, refund_tx: localTx, note: reason });
        return { status: "refunded", refundTx: localTx, refunded: bought.received, reason };
      }
      return await giveBack(reason);
    } catch (refundError) {
      // Leave it visible for a person to finish by hand rather than guess.
      await deps.setStatus(intent.id, "failed", { note: `${reason}; refund failed: ${(refundError as Error).message}` });
      throw refundError;
    }
  }
}
