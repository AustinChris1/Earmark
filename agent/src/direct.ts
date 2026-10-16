import { getAddress, type Address } from "viem";

/**
 * A plain token transfer into the agent wallet. It can pay a bill drive, because that drive's
 * destination is the agent, but only when one drive could take it. Anything ambiguous stays put.
 * Wallet drives are not candidates: the coins never reached their payee, and contributing would pay
 * that payee a second time.
 */

/** AbaPay's vault. A refund from a bill arrives from here and is not a contribution. */
export const ABAPAY_VAULT = "0x5df8aE2B963165b735B18Ca86B1ea448d2AA032C";

export type PoolDrive = {
  id: number;
  token: string;
  destination: string;
  target: bigint;
  /** Raised now. */
  raised: bigint;
  /** Raised when the transfer was mined. Later payments are not subtracted from what the sender saw. */
  raisedThen: bigint;
  closed: boolean;
  deadline: number;
  /** Unix seconds the drive was opened. 0 means unknown, and an unknown drive cannot take a transfer. */
  openedAt: number;
  label: string;
  chatId: string | null;
  collectorTg: string | null;
  collectorName: string | null;
};

export type DirectDecision =
  | { kind: "credit"; driveId: number; credit: bigint; refund: bigint }
  | { kind: "ambiguous"; driveIds: number[] }
  | { kind: "noted"; driveId: number }
  | { kind: "overshoot"; driveId: number }
  | { kind: "held" }
  | { kind: "ignore" };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Half of the 0.01 the old drive card rounded to. 390000 against a target of 387384 is inside it. */
export function displayTolerance(decimals: number): bigint {
  const unit = 10n ** BigInt(Math.max(0, decimals));
  const halfCent = unit / 200n;
  return halfCent > 0n ? halfCent : 1n;
}

/**
 * Raised at `transferBlock`. A payment mined after the transfer was not in the drive yet, so it must
 * not hide what the sender was paying. A closed drive with no stored payments is treated as empty at
 * that moment: the fill that closed it may be the payment we have not indexed.
 */
export function raisedAtTransfer(
  chainRaised: bigint,
  payments: { block: number; amount: bigint }[],
  transferBlock: number,
  closed: boolean,
): bigint {
  let later = 0n;
  let earlier = 0n;
  for (const p of payments) {
    if (p.block > transferBlock) later += p.amount;
    else earlier += p.amount;
  }
  if (later > 0n) return chainRaised > later ? chainRaised - later : 0n;
  if (earlier > 0n) return chainRaised;
  return closed ? 0n : chainRaised;
}

function left(target: bigint, raised: bigint): bigint {
  return target > raised ? target - raised : 0n;
}

function near(amount: bigint, asked: bigint, tolerance: bigint): boolean {
  if (asked <= 0n) return false;
  const gap = amount > asked ? amount - asked : asked - amount;
  return gap <= tolerance;
}

/** What the drive was still asking for when this transfer was mined. Null once it was already full. */
function askedThen(d: PoolDrive): bigint | null {
  if (d.target <= 0n) return null;
  const then = left(d.target, d.raisedThen);
  return then > 0n ? then : null;
}

function isPool(d: PoolDrive, token: string, agent: string): boolean {
  return same(d.destination, agent) && same(d.token, token);
}

function wasOpen(d: PoolDrive, at: number): boolean {
  if (d.openedAt <= 0 || d.openedAt > at) return false;
  if (d.deadline > 0 && at > d.deadline) return false;
  return true;
}

function creditOpen(d: PoolDrive, amount: bigint): DirectDecision {
  if (d.target === 0n) return { kind: "credit", driveId: d.id, credit: amount, refund: 0n };
  const now = left(d.target, d.raised);
  if (now === 0n || d.closed) return { kind: "noted", driveId: d.id };
  const credit = amount < now ? amount : now;
  return { kind: "credit", driveId: d.id, credit, refund: amount - credit };
}

/**
 * Which drive a transfer belongs to.
 *
 * An exact remaining wins, including against a second drive that could take a partial. The old card
 * rounded to two decimals, so a transfer within half a cent of one drive's remaining is that drive
 * too: 0.390000 pays a 0.387384 bill and the extra is returned. A much larger transfer does not fill
 * a smaller open drive. A closed drive that the amount fits is noted and left untouched, so a later
 * drive cannot claim coins that were sent for a bill that already closed.
 */
export function decideDirect(args: {
  amount: bigint;
  token: string;
  agent: string;
  at: number;
  decimals: number;
  pools: PoolDrive[];
  corridorPossible: boolean;
}): DirectDecision {
  if (args.amount <= 0n) return { kind: "ignore" };
  const tolerance = displayTolerance(args.decimals);
  const known = args.pools.filter((d) => isPool(d, args.token, args.agent) && wasOpen(d, args.at));
  const open = known.filter((d) => !d.closed && (d.target === 0n || d.raised < d.target));
  const done = known.filter((d) => d.closed || (d.target > 0n && d.raised >= d.target));

  const exact = open.filter((d) => {
    const asked = askedThen(d);
    return asked !== null && asked === args.amount;
  });
  if (exact.length === 1) return creditOpen(exact[0], args.amount);
  if (exact.length > 1) return { kind: "ambiguous", driveIds: exact.map((d) => d.id) };

  const rounded = open.filter((d) => {
    const asked = askedThen(d);
    return asked !== null && near(args.amount, asked, tolerance);
  });
  if (rounded.length === 1) return creditOpen(rounded[0], args.amount);
  if (rounded.length > 1) return { kind: "ambiguous", driveIds: rounded.map((d) => d.id) };

  const closedFit = done.filter((d) => {
    const asked = askedThen(d);
    return asked !== null && near(args.amount, asked, tolerance);
  });
  if (closedFit.length === 1) return { kind: "noted", driveId: closedFit[0].id };
  if (closedFit.length > 1) return { kind: "held" };

  if (open.length === 1 && open[0].target === 0n) return creditOpen(open[0], args.amount);

  if (open.length === 1 && open[0].target > 0n) {
    const now = left(open[0].target, open[0].raised);
    if (args.amount <= now) return creditOpen(open[0], args.amount);
    return { kind: "overshoot", driveId: open[0].id };
  }

  if (open.length > 1) return { kind: "ambiguous", driveIds: open.map((d) => d.id) };
  // No drive in this coin explains it. A coin that could be swapped into some other open drive
  // stays unlabeled, so this scanner cannot later treat it as a same-coin payment.
  if (args.corridorPossible) return { kind: "ignore" };
  return { kind: "held" };
}

/** True when a person called transfer on the token itself. Swaps, contributes, and x402 settlements are not this. */
export function isDirectUserTransfer(args: {
  txFrom: string;
  txTo: string | null;
  logFrom: string;
  logTo: string;
  token: string;
  agent: string;
  earmark: string;
  vault?: string;
}): boolean {
  const eq = (a: string | null | undefined, b: string) => !!a && same(a, b);
  if (eq(args.txFrom, args.agent) || eq(args.logFrom, args.agent)) return false;
  if (eq(args.txTo, args.earmark)) return false;
  if (eq(args.logFrom, args.vault ?? ABAPAY_VAULT)) return false;
  if (!eq(args.logTo, args.agent)) return false;
  if (!eq(args.txFrom, args.logFrom)) return false;
  if (!eq(args.txTo, args.token)) return false;
  return true;
}

/**
 * Who a counted transfer is attributed to. The refund still goes to the address that sent it.
 * A group payment from a wallet we cannot place stays `direct:`, so the wrong person is not ticked.
 */
export function directMemo(args: {
  payer: string;
  credit: bigint;
  shares: { tgId: string; name: string; left: bigint }[];
  verifiedTgId: string | null;
  chatId: string | null;
  collectorTg: string | null;
  collectorName: string | null;
}): string {
  let payer = args.payer;
  if (/^0x[0-9a-fA-F]{40}$/.test(payer)) {
    try {
      payer = getAddress(payer);
    } catch {
      payer = args.payer;
    }
  }
  if (args.verifiedTgId) {
    const share = args.shares.find((s) => s.tgId === args.verifiedTgId && s.left > 0n);
    if (share) return `tg:${share.tgId}:${share.name}`;
  }
  const exact = args.shares.filter((s) => s.left > 0n && s.left === args.credit);
  if (exact.length === 1) return `tg:${exact[0].tgId}:${exact[0].name}`;
  const privateChat = !!args.chatId && !args.chatId.startsWith("-");
  if (args.shares.length === 0 && privateChat && args.collectorTg) {
    return `tg:${args.collectorTg}:${args.collectorName || "you"}`;
  }
  return `direct:${payer}`;
}

/** The sender recorded on a direct contribution, when the payer row was missed. */
export function payerFromDirectMemo(memo: string): Address | null {
  const m = /^direct:(0x[0-9a-fA-F]{40})$/.exec(memo.trim());
  if (!m) return null;
  try {
    return getAddress(m[1]);
  } catch {
    return null;
  }
}

/** Pay coins, USDC, and whatever an open drive collects. Not the whole token list. */
export function watchTokens(
  known: { symbol: string; address: string }[],
  paySymbols: readonly string[],
  extra: string[],
): string[] {
  const want = new Set([...paySymbols, "USDC"].map((s) => s.toLowerCase()));
  const set = new Set<string>();
  for (const t of known) if (want.has(t.symbol.toLowerCase())) set.add(t.address.toLowerCase());
  for (const a of extra) if (/^0x[0-9a-fA-F]{40}$/.test(a)) set.add(a.toLowerCase());
  return [...set];
}
