import type { Address, Hex } from "viem";
import type { Bill, BillResult } from "./abapay.js";

/**
 * Bill drives. The group collects the bill's price into the Earmark agent wallet, and when the drive
 * fills, the agent pays the provider itself through AbaPay and posts the electricity token or the
 * airtime receipt in the chat. Unlike an ordinary drive the money waits in the agent wallet until the
 * bill is paid; every path out of here ends with the bill paid or the money back with the people
 * who sent it.
 */

/** Headroom on the quoted price so a small move in AbaPay's rate does not stall a full drive. */
export const BILL_HEADROOM_BPS = 200n;

export function billTarget(quoted: bigint): bigint {
  return quoted + (quoted * BILL_HEADROOM_BPS + 9_999n) / 10_000n;
}

/** "45000000000" -> "4500•••0000", enough for the group to recognise its meter, not to copy it. */
export function maskNumber(n: string): string {
  return n.length <= 8 ? n : `${n.slice(0, 4)}•••${n.slice(-4)}`;
}

export type Share = { payer: Address; amount: bigint };

/**
 * Splits `pool` back across the people who paid, in proportion to what each paid. Rounding dust
 * goes to the largest payer so the shares add up to the pool exactly. Payments the agent itself made
 * (forwarded x402 contributions) are left out: the agent cannot refund itself.
 */
export function proRata(payments: Share[], pool: bigint, agent: Address): Share[] {
  const byPayer = new Map<string, Share>();
  for (const p of payments) {
    if (p.payer.toLowerCase() === agent.toLowerCase()) continue;
    const key = p.payer.toLowerCase();
    const prev = byPayer.get(key);
    byPayer.set(key, { payer: p.payer, amount: (prev?.amount ?? 0n) + p.amount });
  }
  const shares = [...byPayer.values()];
  const total = shares.reduce((a, s) => a + s.amount, 0n);
  if (total === 0n || pool === 0n) return [];
  const out = shares.map((s) => ({ payer: s.payer, amount: (pool * s.amount) / total }));
  const dust = pool - out.reduce((a, s) => a + s.amount, 0n);
  if (dust > 0n) {
    const biggest = out.reduce((m, s, i) => (s.amount > out[m].amount ? i : m), 0);
    out[biggest].amount += dust;
  }
  return out.filter((s) => s.amount > 0n);
}

export type BillDeps = {
  agent: Address;
  token: Address;
  pay(bill: Bill, max: bigint): Promise<BillResult>;
  refund(to: Address, amount: bigint): Promise<Hex>;
  balance(): Promise<bigint>;
  setStatus(driveId: number, status: string, fields?: Record<string, string>): Promise<void>;
};

export type BillOutcome =
  | { status: "paid"; result: BillResult; refunds: { payer: Address; amount: bigint; tx: Hex }[] }
  | { status: "refunded"; reason: string; refunds: { payer: Address; amount: bigint; tx: Hex }[] }
  | { status: "failed"; reason: string };

/** Pays a full bill drive, then returns any change; on failure returns the whole pool. */
export async function settleBill(driveId: number, bill: Bill, raised: bigint, payments: Share[], deps: BillDeps): Promise<BillOutcome> {
  await deps.setStatus(driveId, "paying");

  const giveBack = async (pool: bigint) => {
    const refunds: { payer: Address; amount: bigint; tx: Hex }[] = [];
    for (const s of proRata(payments, pool, deps.agent)) {
      refunds.push({ ...s, tx: await deps.refund(s.payer, s.amount) });
    }
    return refunds;
  };

  let result: BillResult;
  try {
    result = await deps.pay(bill, raised);
  } catch (e) {
    // Nothing was signed (a price or coin check refused it), so the whole pool is still here.
    const reason = (e as Error).message;
    const refunds = await giveBack(raised);
    await deps.setStatus(driveId, "refunded", { note: reason });
    return { status: "refunded", reason, refunds };
  }

  if (result.ok) {
    const change = raised - result.quote.amount;
    const refunds = change > 0n ? await giveBack(change) : [];
    await deps.setStatus(driveId, "paid", {
      settle_tx: result.settleTx ?? "",
      purchased_code: result.purchasedCode ?? "",
      units: result.units ?? "",
      request_id: result.requestId ?? "",
    });
    return { status: "paid", result, refunds };
  }

  // Settled but not vended: AbaPay refunds the agent. Return what has actually come back, no more.
  const back = await deps.balance();
  const pool = back < raised ? back : raised;
  const reason = `AbaPay could not vend the bill (${result.status}).`;
  if (pool < raised) {
    await deps.setStatus(driveId, "failed", { note: `${reason} Waiting on AbaPay's refund before paying people back.`, request_id: result.requestId ?? "" });
    return { status: "failed", reason };
  }
  const refunds = await giveBack(pool);
  await deps.setStatus(driveId, "refunded", { note: reason, request_id: result.requestId ?? "" });
  return { status: "refunded", reason, refunds };
}
