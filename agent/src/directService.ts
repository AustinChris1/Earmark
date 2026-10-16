import { getAddress, isAddress, parseAbi, type Address, type Hex } from "viem";
import { PAY_COINS, routeFor } from "./corridor.js";
import { TOKENS, tokenByAddress } from "./config.js";
import {
  EARMARK_ABI,
  ERC20_ABI,
  account,
  contributeFromAgent,
  publicClient,
  readDrive,
  refundFromAgent,
  requireEarmark,
} from "./chain.js";
import {
  allOpenDrives,
  contributeTxTaken,
  corridorByPayTx,
  deleteDirect,
  directStillHeld,
  drivesPaying,
  getDirect,
  getMeta,
  insertDirect,
  paymentsFor,
  pendingIntents,
  setMeta,
  sharesFor,
  tgForAddress,
  unfinishedDirects,
  unsettledCorridorIntents,
  updateDirect,
  billsInFlight,
  type DirectRow,
} from "./db.js";
import {
  decideDirect,
  directMemo,
  isDirectUserTransfer,
  raisedAtTransfer,
  watchTokens,
  type DirectDecision,
  type PoolDrive,
} from "./direct.js";
import { memoTgId } from "./format.js";

const TRANSFER = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const AUTH_ABI = parseAbi(["function authorizationState(address authorizer, bytes32 nonce) view returns (bool)"]);

const LOOKBACK = 100_000n;
const CHUNK = 2_000n;
const POLL_MS = 12_000;

export type DirectNotice =
  | {
      kind: "noted";
      amount: string;
      token: string;
      payer: string;
      driveId: number;
      label: string;
      chatId: string | null;
      because: "closed" | "full";
    }
  | {
      kind: "ambiguous";
      amount: string;
      token: string;
      payer: string;
      drives: { id: number; label: string; chatId: string | null }[];
    }
  | {
      kind: "overshoot";
      amount: string;
      token: string;
      payer: string;
      driveId: number;
      label: string;
      chatId: string | null;
      needed: string;
    };

type Notify = (note: DirectNotice) => Promise<void>;
let notify: Notify = async () => {};

/** The bot registers this. Crediting does not depend on it. */
export function onDirectNote(fn: Notify) {
  notify = fn;
}

type ChainDrive = Awaited<ReturnType<typeof readDrive>>;

function poolFrom(
  id: number,
  chain: ChainDrive,
  meta: { label: string; chatId: string | null; collectorTg: string | null; collectorName: string | null; openedAt: number },
  payments: { block: number; amount: string }[],
  transferBlock: number,
): PoolDrive | null {
  if (chain.destination.toLowerCase() !== account.address.toLowerCase()) return null;
  const closed = chain.closed;
  const raised = chain.raised;
  return {
    id,
    token: chain.token,
    destination: chain.destination,
    target: chain.target,
    raised,
    raisedThen: raisedAtTransfer(
      raised,
      payments.map((p) => ({ block: p.block, amount: BigInt(p.amount) })),
      transferBlock,
      closed,
    ),
    closed,
    deadline: Number(chain.deadline),
    openedAt: meta.openedAt,
    label: meta.label || chain.label,
    chatId: meta.chatId,
    collectorTg: meta.collectorTg,
    collectorName: meta.collectorName,
  };
}

async function loadPools(transferBlock: number): Promise<PoolDrive[]> {
  const rows = await drivesPaying(account.address);
  const seen = new Set<number>();
  const out: PoolDrive[] = [];
  for (const r of rows) {
    seen.add(r.id);
    const chain = await readDrive(BigInt(r.id));
    const pool = poolFrom(
      r.id,
      chain,
      {
        label: r.label,
        chatId: r.chat_id,
        collectorTg: r.collector_tg,
        collectorName: r.collector_name,
        openedAt: r.created_at,
      },
      await paymentsFor(r.id),
      transferBlock,
    );
    if (pool) out.push(pool);
  }
  for (const b of await billsInFlight()) {
    if (seen.has(b.drive_id)) continue;
    const chain = await readDrive(BigInt(b.drive_id));
    const pool = poolFrom(
      b.drive_id,
      chain,
      { label: chain.label, chatId: null, collectorTg: null, collectorName: null, openedAt: b.created_at },
      await paymentsFor(b.drive_id),
      transferBlock,
    );
    if (pool) out.push(pool);
  }
  return out;
}

async function corridorPossible(token: Address, at: number): Promise<boolean> {
  const pay = tokenByAddress(token);
  if (!pay) return false;
  for (const d of await allOpenDrives()) {
    if (d.created_at > at) continue;
    if (routeFor(pay, tokenByAddress(d.token))) return true;
  }
  return false;
}

/** Coins already promised to a drive, a swap, a settled x402 forward, or another unlabeled transfer. */
async function spare(token: Address, exceptPayTx: string): Promise<bigint> {
  const balance = await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
  let reserved = 0n;
  const seen = new Set<number>();
  const consider = async (id: number, tokenAddress: string) => {
    if (seen.has(id)) return;
    if (tokenAddress.toLowerCase() !== token.toLowerCase()) return;
    const chain = await readDrive(BigInt(id));
    if (chain.closed) return;
    if (chain.destination.toLowerCase() !== account.address.toLowerCase()) return;
    if (chain.token.toLowerCase() !== token.toLowerCase()) return;
    seen.add(id);
    reserved += chain.raised;
  };
  for (const d of await drivesPaying(account.address)) await consider(d.id, d.token);
  for (const b of await billsInFlight()) {
    const chain = await readDrive(BigInt(b.drive_id));
    await consider(b.drive_id, chain.token);
  }
  for (const c of await unsettledCorridorIntents()) {
    if (c.pay_token.toLowerCase() === token.toLowerCase()) reserved += BigInt(c.pay_amount);
  }
  for (const intent of await pendingIntents()) {
    if (intent.token.toLowerCase() !== token.toLowerCase() || !intent.payer || !intent.nonce) continue;
    const settled = await publicClient
      .readContract({
        address: token,
        abi: AUTH_ABI,
        functionName: "authorizationState",
        args: [getAddress(intent.payer), intent.nonce as Hex],
      })
      .catch(() => false);
    if (settled) reserved += BigInt(intent.amount);
  }
  for (const row of await directStillHeld()) {
    if (row.pay_tx === exceptPayTx) continue;
    if (row.token.toLowerCase() !== token.toLowerCase()) continue;
    reserved += BigInt(row.amount);
  }
  return balance > reserved ? balance - reserved : 0n;
}

async function buildMemo(drive: PoolDrive, payer: string, credit: bigint): Promise<string> {
  const paid = new Map<string, bigint>();
  for (const p of await paymentsFor(drive.id)) {
    const id = memoTgId(p.memo);
    if (!id) continue;
    paid.set(id, (paid.get(id) ?? 0n) + BigInt(p.amount));
  }
  const shares = (await sharesFor(drive.id)).map((s) => ({
    tgId: s.tg_id,
    name: s.name,
    left: BigInt(s.amount) - (paid.get(s.tg_id) ?? 0n),
  }));
  return directMemo({
    payer,
    credit,
    shares,
    verifiedTgId: (await tgForAddress(payer)) ?? null,
    chatId: drive.chatId,
    collectorTg: drive.collectorTg,
    collectorName: drive.collectorName,
  });
}

/** A contribute this transfer already made, before the hash was saved. An x402 or swap forward is not it. */
async function findContribute(driveId: number, amount: bigint, memo: string, afterBlock: number): Promise<Hex | null> {
  const head = await publicClient.getBlockNumber();
  const earliest = head > LOOKBACK ? head - LOOKBACK : 0n;
  const from = BigInt(afterBlock) > earliest ? BigInt(afterBlock) : earliest;
  for (let start = from; start <= head; start += CHUNK) {
    const end = start + CHUNK - 1n < head ? start + CHUNK - 1n : head;
    const logs = await publicClient.getContractEvents({
      address: requireEarmark(),
      abi: EARMARK_ABI,
      eventName: "Contributed",
      args: { id: BigInt(driveId), payer: account.address },
      fromBlock: start,
      toBlock: end,
    });
    for (const log of logs) {
      if (log.args.amount !== amount || (log.args.memo ?? "") !== memo) continue;
      if (log.blockNumber === null || log.blockNumber <= BigInt(afterBlock)) continue;
      if (await contributeTxTaken(log.transactionHash)) continue;
      return log.transactionHash;
    }
  }
  return null;
}

async function tell(row: DirectRow, note: DirectNotice) {
  if (row.notified) return;
  await notify(note);
  await updateDirect(row.pay_tx, { notified: 1 });
}

function describe(pools: PoolDrive[], ids: number[]) {
  return ids.map((id) => {
    const d = pools.find((p) => p.id === id);
    return { id, label: d?.label ?? `Drive ${id}`, chatId: d?.chatId ?? null };
  });
}

async function finishSubmitted(row: DirectRow) {
  if (!row.contribute_tx) return;
  const receipt = await publicClient.getTransactionReceipt({ hash: row.contribute_tx as Hex }).catch(() => null);
  if (!receipt) return;
  if (receipt.status !== "success") {
    await updateDirect(row.pay_tx, { contribute_tx: null, status: "held" });
    return;
  }
  const refund = BigInt(row.refund_amount ?? "0");
  if (refund > 0n) {
    if (row.refund_tx) {
      const sent = await publicClient.getTransactionReceipt({ hash: row.refund_tx as Hex }).catch(() => null);
      if (!sent) return;
      if (sent.status !== "success") {
        await updateDirect(row.pay_tx, { refund_tx: null });
        return;
      }
    } else {
      const token = getAddress(row.token);
      const free = await spare(token, row.pay_tx);
      if (free < refund) {
        console.error(`direct: ${row.pay_tx} is waiting to return the extra`);
        return;
      }
      await refundFromAgent(token, getAddress(row.payer), refund, {
        onSent: (hash) => updateDirect(row.pay_tx, { refund_tx: hash }),
      });
    }
  }
  await updateDirect(row.pay_tx, { status: "credited" });
  console.log(`direct: credited drive ${row.drive_id} from ${row.pay_tx}`);
}

async function beginCredit(row: DirectRow, decision: Extract<DirectDecision, { kind: "credit" }>, pools: PoolDrive[]) {
  const drive = pools.find((p) => p.id === decision.driveId);
  if (!drive) {
    await updateDirect(row.pay_tx, { status: "held" });
    return;
  }
  const token = getAddress(row.token);
  const live = await readDrive(BigInt(decision.driveId));
  const room = live.target > live.raised ? live.target - live.raised : 0n;
  if (
    live.closed ||
    live.destination.toLowerCase() !== account.address.toLowerCase() ||
    (live.target > 0n && room < decision.credit)
  ) {
    await updateDirect(row.pay_tx, { status: "held" });
    console.error(`direct: ${row.pay_tx} no longer fits drive ${decision.driveId}`);
    return;
  }
  const memo = row.memo || (await buildMemo(drive, row.payer, decision.credit));
  await updateDirect(row.pay_tx, {
    status: "crediting",
    drive_id: decision.driveId,
    credit: decision.credit.toString(),
    refund_amount: decision.refund.toString(),
    memo,
  });
  const free = await spare(token, row.pay_tx);
  if (free < BigInt(row.amount)) {
    await updateDirect(row.pay_tx, { status: "held" });
    console.error(`direct: ${row.pay_tx} left in place, the wallet is already promised`);
    return;
  }
  try {
    const existing = row.contribute_tx ? (row.contribute_tx as Hex) : await findContribute(decision.driveId, decision.credit, memo, row.block);
    if (existing) {
      await updateDirect(row.pay_tx, { contribute_tx: existing });
    } else {
      await contributeFromAgent(BigInt(decision.driveId), token, decision.credit, memo, {
        celoGas: true,
        onSent: (hash) => updateDirect(row.pay_tx, { contribute_tx: hash }),
      });
    }
    const fresh = await getDirect(row.pay_tx);
    if (fresh) await finishSubmitted(fresh);
  } catch (e) {
    const fresh = await getDirect(row.pay_tx);
    if (fresh?.contribute_tx) {
      console.error(`direct: ${fresh.contribute_tx} was sent, finishing it on the next pass`);
      return;
    }
    await updateDirect(row.pay_tx, { status: "held" });
    console.error(`direct: ${row.pay_tx} was not counted: ${(e as Error).message}`);
  }
}

async function act(row: DirectRow) {
  if (row.status === "credited") return;
  if (row.status === "noted") {
    if (!row.notified && row.drive_id) {
      const chain = await readDrive(BigInt(row.drive_id)).catch(() => null);
      const pool = (await loadPools(row.block)).find((p) => p.id === row.drive_id);
      await tell(row, {
        kind: "noted",
        amount: row.amount,
        token: row.token,
        payer: row.payer,
        driveId: row.drive_id,
        label: pool?.label ?? chain?.label ?? "this drive",
        chatId: pool?.chatId ?? null,
        because: chain?.closed ? "closed" : "full",
      });
    }
    return;
  }
  if (row.contribute_tx) {
    await finishSubmitted(row);
    return;
  }
  const pools = await loadPools(row.block);
  const info = tokenByAddress(row.token);
  const decision = decideDirect({
    amount: BigInt(row.amount),
    token: row.token,
    agent: account.address,
    at: row.block_time,
    decimals: info?.decimals ?? 6,
    pools,
    corridorPossible: info ? await corridorPossible(info.address, row.block_time) : false,
  });

  if (decision.kind === "ignore") {
    await deleteDirect(row.pay_tx);
    console.log(`direct: left ${row.pay_tx} unlabeled`);
    return;
  }
  if (decision.kind === "credit") {
    await beginCredit(row, decision, pools);
    return;
  }
  if (decision.kind === "noted") {
    const pool = pools.find((p) => p.id === decision.driveId);
    await updateDirect(row.pay_tx, { status: "noted", drive_id: decision.driveId });
    console.log(`direct: noted ${row.pay_tx} for drive ${decision.driveId}`);
    await tell({ ...row, drive_id: decision.driveId, status: "noted" }, {
      kind: "noted",
      amount: row.amount,
      token: row.token,
      payer: row.payer,
      driveId: decision.driveId,
      label: pool?.label ?? "this drive",
      chatId: pool?.chatId ?? null,
      because: pool?.closed ? "closed" : "full",
    });
    return;
  }
  if (decision.kind === "ambiguous") {
    if (row.status !== "ambiguous") await updateDirect(row.pay_tx, { status: "ambiguous", drive_id: null });
    await tell(row, {
      kind: "ambiguous",
      amount: row.amount,
      token: row.token,
      payer: row.payer,
      drives: describe(pools, decision.driveIds),
    });
    return;
  }
  if (decision.kind === "overshoot") {
    const pool = pools.find((p) => p.id === decision.driveId);
    const needed = pool && pool.target > pool.raised ? pool.target - pool.raised : 0n;
    if (row.status !== "held" || row.drive_id !== decision.driveId) {
      await updateDirect(row.pay_tx, { status: "held", drive_id: decision.driveId });
    }
    await tell(row, {
      kind: "overshoot",
      amount: row.amount,
      token: row.token,
      payer: row.payer,
      driveId: decision.driveId,
      label: pool?.label ?? "this drive",
      chatId: pool?.chatId ?? null,
      needed: needed.toString(),
    });
    return;
  }
  if (row.status !== "held") await updateDirect(row.pay_tx, { status: "held", drive_id: null });
}

async function scanTokens(): Promise<Address[]> {
  const extra: string[] = [];
  for (const d of await allOpenDrives()) extra.push(d.token);
  for (const b of await billsInFlight()) {
    const chain = await readDrive(BigInt(b.drive_id)).catch(() => null);
    if (chain) extra.push(chain.token);
  }
  return watchTokens(Object.values(TOKENS), PAY_COINS, extra).flatMap((a) => (isAddress(a) ? [getAddress(a)] : []));
}

async function scanNew() {
  const head = await publicClient.getBlockNumber();
  const saved = await getMeta("direct_block");
  let from = saved === undefined ? (head > LOOKBACK ? head - LOOKBACK : 0n) : BigInt(saved) + 1n;
  if (from > head) return;
  const tokens = await scanTokens();
  const txCache = new Map<string, { from: string; to: string | null }>();
  const timeCache = new Map<string, number>();
  while (from <= head) {
    const to = from + CHUNK - 1n < head ? from + CHUNK - 1n : head;
    const logs: { token: Address; blockNumber: bigint; logIndex: number; transactionHash: Hex; from: string; value: bigint }[] = [];
    for (const token of tokens) {
      const part = await publicClient.getContractEvents({
        address: token,
        abi: TRANSFER,
        eventName: "Transfer",
        args: { to: account.address },
        fromBlock: from,
        toBlock: to,
      });
      for (const log of part) {
        if (!log.args.from || log.args.value === undefined || log.args.value === 0n || log.blockNumber === null) continue;
        logs.push({
          token,
          blockNumber: log.blockNumber,
          logIndex: log.logIndex ?? 0,
          transactionHash: log.transactionHash,
          from: log.args.from,
          value: log.args.value,
        });
      }
    }
    logs.sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.logIndex - b.logIndex));
    for (const log of logs) {
      const hash = log.transactionHash.toLowerCase();
      if (await getDirect(hash)) continue;
      if (await corridorByPayTx(hash)) continue;
      let tx = txCache.get(hash);
      if (!tx) {
        const fetched = await publicClient.getTransaction({ hash: log.transactionHash });
        tx = { from: fetched.from, to: fetched.to };
        txCache.set(hash, tx);
      }
      if (
        !isDirectUserTransfer({
          txFrom: tx.from,
          txTo: tx.to,
          logFrom: log.from,
          logTo: account.address,
          token: log.token,
          agent: account.address,
          earmark: requireEarmark(),
        })
      ) {
        continue;
      }
      const key = log.blockNumber.toString();
      let at = timeCache.get(key);
      if (at === undefined) {
        const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
        at = Number(block.timestamp);
        timeCache.set(key, at);
      }
      await insertDirect({
        pay_tx: hash,
        payer: getAddress(log.from),
        token: getAddress(log.token),
        amount: log.value.toString(),
        block: Number(log.blockNumber),
        block_time: at,
        status: "held",
      });
    }
    await setMeta("direct_block", to.toString());
    from = to + 1n;
  }
}

/** Watches plain transfers into the agent and counts one only when a single drive can take it. */
export function startDirectScanner() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await scanNew();
    } catch (e) {
      console.error("direct scan:", (e as Error).message);
    }
    try {
      for (const row of await unfinishedDirects()) {
        await act(row).catch((e) => console.error(`direct ${row.pay_tx}:`, (e as Error).message));
      }
    } catch (e) {
      console.error("direct:", (e as Error).message);
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(() => void tick(), POLL_MS);
}
