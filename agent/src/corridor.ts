import type { Address, Hex } from "viem";
import { tokenBySymbol, type TokenInfo } from "./config.js";

/**
 * Cross-currency drives. A drive is opened in the payee's local coin (cNGN, wARS, wBRL); someone
 * abroad pays in dollars. The agent receives the dollars, swaps them on Textile FX, and contributes
 * the local coin to the drive, so the payee only ever receives the coin the drive names and the
 * destination is still the one locked at creation.
 *
 * This is the one place Earmark holds money: the dollars sit in the agent wallet for the seconds
 * the swap takes. The payer is shown the most they will spend; if the market moves past it, or any
 * step fails before the drive is paid, the dollars go back to the address they came from.
 */

/** Local coins with a live Textile corridor against USDT on Celo. */
export const CORRIDOR_LOCAL = ["cNGN", "wARS", "wBRL"] as const;
/** Dollar coins a payer can send. USA₮ has no direct corridor, so it is swapped to USDT first. */
export const CORRIDOR_PAY = ["USDT", "USAT"] as const;

/** Headroom over the quoted price that the payer is asked to send; the unused part is refunded. */
export const HEADROOM_BPS = 100n;

export function isCorridorLocal(token: TokenInfo | undefined): boolean {
  return !!token && (CORRIDOR_LOCAL as readonly string[]).includes(token.symbol);
}

export function payToken(symbol: string): TokenInfo | undefined {
  const t = tokenBySymbol(symbol);
  return t && (CORRIDOR_PAY as readonly string[]).includes(t.symbol) ? t : undefined;
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
  if (drive.closed) return giveBack("The drive closed before the payment could be swapped.");
  const want = localToBuy(intent.want_local, drive.target, drive.raised);
  if (want === 0n) return giveBack("The drive is already full.");

  await deps.setStatus(intent.id, "swapping");

  // Local coin already bought but not yet in the drive; if that last step fails, it goes back too.
  let bought: { swapHash: Hex; received: bigint } | undefined;

  try {
    // USA₮ has no corridor to local coins, so it becomes USDT first.
    if (heldToken.toLowerCase() === deps.usat.toLowerCase()) {
      const hop = await deps.firmExactIn(deps.usat, deps.usdt, held);
      const { received } = await deps.execute(hop, deps.usat, deps.usdt);
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
