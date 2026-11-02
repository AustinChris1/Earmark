import { createClient, type Client, type InValue } from "@libsql/client";
import { env } from "./config.js";

// One code path for both: a local file in development, a Turso database in production.
// The host filesystem is ephemeral, so anything that must outlive a restart lives in Turso.
export const db: Client = createClient({
  url: env.DATABASE_URL,
  ...(env.DATABASE_AUTH_TOKEN ? { authToken: env.DATABASE_AUTH_TOKEN } : {}),
});

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS drives (
     id INTEGER PRIMARY KEY,
     chat_id TEXT NOT NULL,
     label TEXT NOT NULL,
     token TEXT NOT NULL,
     destination TEXT NOT NULL,
     target TEXT NOT NULL,
     deadline INTEGER NOT NULL DEFAULT 0,
     collector_tg TEXT,
     collector_name TEXT,
     created_tx TEXT,
     closed INTEGER NOT NULL DEFAULT 0,
     token_symbol TEXT,
     token_decimals INTEGER,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS payments (
     tx_hash TEXT PRIMARY KEY,
     drive_id INTEGER NOT NULL,
     payer TEXT NOT NULL,
     amount TEXT NOT NULL,
     memo TEXT NOT NULL DEFAULT '',
     block INTEGER NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS shares (
     drive_id INTEGER NOT NULL,
     tg_id TEXT NOT NULL,
     name TEXT NOT NULL,
     amount TEXT NOT NULL,
     PRIMARY KEY (drive_id, tg_id)
   )`,
  `CREATE TABLE IF NOT EXISTS instalments (
     drive_id INTEGER NOT NULL,
     tg_id TEXT NOT NULL,
     seq INTEGER NOT NULL,
     name TEXT NOT NULL,
     amount TEXT NOT NULL,
     due_at INTEGER NOT NULL,
     paid_at INTEGER,
     nudged_at INTEGER,
     PRIMARY KEY (drive_id, tg_id, seq)
   )`,
  `CREATE TABLE IF NOT EXISTS x402_intents (
     id TEXT PRIMARY KEY,
     drive_id INTEGER NOT NULL,
     token TEXT NOT NULL,
     amount TEXT NOT NULL,
     payer_name TEXT NOT NULL,
     forwarded_tx TEXT,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS verifications (
     tg_id TEXT PRIMARY KEY,
     address TEXT NOT NULL,
     linked_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  // A bill drive: what the agent will pay through AbaPay once the drive fills, and how that went.
  `CREATE TABLE IF NOT EXISTS bills (
     drive_id INTEGER PRIMARY KEY,
     category TEXT NOT NULL,
     service_id TEXT NOT NULL,
     network TEXT NOT NULL,
     billers_code TEXT NOT NULL,
     naira_amount INTEGER NOT NULL,
     quoted TEXT NOT NULL,
     status TEXT NOT NULL,
     settle_tx TEXT,
     purchased_code TEXT,
     units TEXT,
     request_id TEXT,
     note TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  // Dollars received for a cross-currency drive, followed from arrival to the drive or back to the payer.
  `CREATE TABLE IF NOT EXISTS corridor_intents (
     id TEXT PRIMARY KEY,
     drive_id INTEGER NOT NULL,
     payer TEXT NOT NULL,
     pay_token TEXT NOT NULL,
     pay_amount TEXT NOT NULL,
     pay_tx TEXT NOT NULL UNIQUE,
     want_local TEXT NOT NULL,
     memo TEXT NOT NULL,
     status TEXT NOT NULL,
     swap_tx TEXT,
     contribute_tx TEXT,
     refund_tx TEXT,
     local_amount TEXT,
     note TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  // Telegram never lists a group's members to a bot, so this is everyone the bot has actually seen:
  // anyone who sent it a command, tapped a button, or was announced joining.
  `CREATE TABLE IF NOT EXISTS members (
     chat_id TEXT NOT NULL,
     tg_id TEXT NOT NULL,
     name TEXT NOT NULL,
     seen_at INTEGER NOT NULL,
     PRIMARY KEY (chat_id, tg_id)
   )`,
  // Every service Earmark bought through buy (usebuy.ai), paid from the agent wallet over x402.
  `CREATE TABLE IF NOT EXISTS buy_calls (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     service TEXT NOT NULL,
     amount TEXT NOT NULL,
     token TEXT NOT NULL,
     tx TEXT,
     ok INTEGER NOT NULL,
     note TEXT,
     created_at INTEGER NOT NULL
   )`,
  // A plain transfer to the agent. Kept so a restart cannot count it twice, and so a bill refund
  // can find the person who sent it. `noted` and `held` rows are not moved.
  `CREATE TABLE IF NOT EXISTS direct_payments (
     pay_tx TEXT PRIMARY KEY,
     payer TEXT NOT NULL,
     token TEXT NOT NULL,
     amount TEXT NOT NULL,
     block INTEGER NOT NULL,
     block_time INTEGER NOT NULL,
     drive_id INTEGER,
     credit TEXT,
     refund_amount TEXT,
     contribute_tx TEXT,
     refund_tx TEXT,
     memo TEXT,
     status TEXT NOT NULL,
     notified INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   )`,
];

// Columns added after a table first shipped. SQLite has no ADD COLUMN IF NOT EXISTS, so a column
// that is already there is the expected error on every start after the first.
const COLUMNS = [
  // The coin a bill drive collects and pays AbaPay in: USA₮, or USD₮ so other currencies can swap in.
  `ALTER TABLE bills ADD COLUMN token TEXT NOT NULL DEFAULT 'USAT'`,
  // What AbaPay actually took, so its refund can be recognised if the bill is not delivered.
  `ALTER TABLE bills ADD COLUMN paid_amount TEXT`,
  // The authorisation the agent signed for AbaPay, as JSON, to tell later whether the money left.
  `ALTER TABLE bills ADD COLUMN auth TEXT`,
  // A top-up abroad: country, operator and plan, as JSON. Null for a Nigerian bill.
  `ALTER TABLE bills ADD COLUMN intl TEXT`,
  // Who signed an x402 payment, and the authorisation nonce that proves it settled on chain.
  `ALTER TABLE x402_intents ADD COLUMN payer TEXT`,
  `ALTER TABLE x402_intents ADD COLUMN nonce TEXT`,
];

export async function migrate() {
  for (const sql of SCHEMA) await db.execute(sql);
  for (const sql of COLUMNS) {
    await db.execute(sql).catch((e: Error) => {
      if (!/duplicate column/i.test(e.message)) throw e;
    });
  }
}

export type DriveRow = {
  id: number;
  chat_id: string;
  label: string;
  token: string;
  destination: string;
  target: string;
  deadline: number;
  collector_tg: string | null;
  collector_name: string | null;
  created_tx: string | null;
  closed: number;
  token_symbol: string | null;
  token_decimals: number | null;
  created_at: number;
};

export type PaymentRow = {
  tx_hash: string;
  drive_id: number;
  payer: string;
  amount: string;
  memo: string;
  block: number;
  created_at: number;
};

export type ShareRow = { drive_id: number; tg_id: string; name: string; amount: string };

export type MemberRow = { chat_id: string; tg_id: string; name: string; seen_at: number };

export type InstalmentRow = {
  drive_id: number;
  tg_id: string;
  seq: number;
  name: string;
  amount: string;
  due_at: number;
  paid_at: number | null;
  nudged_at: number | null;
};

export type DueInstalment = InstalmentRow & { chat_id: string; label: string; token: string };

export type X402Intent = {
  id: string;
  drive_id: number;
  token: string;
  amount: string;
  payer_name: string;
  forwarded_tx: string | null;
  /** The wallet that signed the x402 payment; null on intents recorded before this was kept. */
  payer: string | null;
  /** The EIP-3009 authorisation nonce; once the token marks it used, the money has arrived. */
  nonce: string | null;
  created_at: number;
};

const now = () => Math.floor(Date.now() / 1000);

async function all<T>(sql: string, args: InValue[] = []): Promise<T[]> {
  const r = await db.execute({ sql, args });
  return r.rows as unknown as T[];
}

async function one<T>(sql: string, args: InValue[] = []): Promise<T | undefined> {
  const rows = await all<T>(sql, args);
  return rows[0];
}

async function run(sql: string, args: InValue[] = []): Promise<number> {
  const r = await db.execute({ sql, args });
  return Number(r.rowsAffected ?? 0);
}

export async function insertDrive(d: Omit<DriveRow, "created_at" | "closed" | "token_symbol" | "token_decimals">) {
  await run(
    `INSERT INTO drives (id, chat_id, label, token, destination, target, deadline, collector_tg, collector_name, created_tx, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.id,
      d.chat_id,
      d.label,
      d.token,
      d.destination,
      d.target,
      d.deadline,
      d.collector_tg,
      d.collector_name,
      d.created_tx,
      now(),
    ],
  );
}

export function getDrive(id: number) {
  return one<DriveRow>(`SELECT * FROM drives WHERE id = ?`, [id]);
}

export function openDrivesForChat(chatId: string) {
  return all<DriveRow>(`SELECT * FROM drives WHERE chat_id = ? AND closed = 0 ORDER BY id DESC`, [chatId]);
}

export function allOpenDrives() {
  return all<DriveRow>(`SELECT * FROM drives WHERE closed = 0 ORDER BY id`);
}

export function drivesPaying(destination: string) {
  return all<DriveRow>(`SELECT * FROM drives WHERE lower(destination) = lower(?) ORDER BY id`, [destination]);
}

export function latestDriveForChat(chatId: string) {
  return one<DriveRow>(`SELECT * FROM drives WHERE chat_id = ? ORDER BY id DESC LIMIT 1`, [chatId]);
}

export async function markClosed(id: number) {
  await run(`UPDATE drives SET closed = 1 WHERE id = ?`, [id]);
}

export async function insertPayment(p: Omit<PaymentRow, "created_at">): Promise<boolean> {
  const changes = await run(
    `INSERT OR IGNORE INTO payments (tx_hash, drive_id, payer, amount, memo, block, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [p.tx_hash, p.drive_id, p.payer, p.amount, p.memo, p.block, now()],
  );
  return changes > 0;
}

export function paymentsFor(driveId: number) {
  return all<PaymentRow>(`SELECT * FROM payments WHERE drive_id = ? ORDER BY block ASC`, [driveId]);
}

export async function setShare(s: ShareRow) {
  await run(
    `INSERT INTO shares (drive_id, tg_id, name, amount) VALUES (?, ?, ?, ?)
     ON CONFLICT(drive_id, tg_id) DO UPDATE SET name = excluded.name, amount = excluded.amount`,
    [s.drive_id, s.tg_id, s.name, s.amount],
  );
}

export async function seenMember(chatId: string, tgId: string, name: string) {
  await run(
    `INSERT INTO members (chat_id, tg_id, name, seen_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(chat_id, tg_id) DO UPDATE SET name = excluded.name, seen_at = excluded.seen_at`,
    [chatId, tgId, name, Math.floor(Date.now() / 1000)],
  );
}

export async function forgetMember(chatId: string, tgId: string) {
  await run(`DELETE FROM members WHERE chat_id = ? AND tg_id = ?`, [chatId, tgId]);
}

export function membersFor(chatId: string) {
  return all<MemberRow>(`SELECT * FROM members WHERE chat_id = ? ORDER BY seen_at ASC`, [chatId]);
}

export function sharesFor(driveId: number) {
  return all<ShareRow>(`SELECT * FROM shares WHERE drive_id = ?`, [driveId]);
}

// A /split can only key on @username; the first /pay from that person swaps in their numeric id so payments match.
export async function rekeyMember(driveId: number, from: string, to: string, name: string) {
  if (from === to) return;
  await run(`UPDATE OR REPLACE shares SET tg_id = ?, name = ? WHERE drive_id = ? AND tg_id = ?`, [
    to,
    name,
    driveId,
    from,
  ]);
  await run(`UPDATE OR REPLACE instalments SET tg_id = ?, name = ? WHERE drive_id = ? AND tg_id = ?`, [
    to,
    name,
    driveId,
    from,
  ]);
}

export async function replacePlan(driveId: number, rows: Omit<InstalmentRow, "paid_at" | "nudged_at">[]) {
  await db.batch(
    [
      { sql: `DELETE FROM instalments WHERE drive_id = ?`, args: [driveId] as InValue[] },
      ...rows.map((r) => ({
        sql: `INSERT INTO instalments (drive_id, tg_id, seq, name, amount, due_at) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [r.drive_id, r.tg_id, r.seq, r.name, r.amount, r.due_at] as InValue[],
      })),
    ],
    "write",
  );
}

export function instalmentsFor(driveId: number) {
  return all<InstalmentRow>(`SELECT * FROM instalments WHERE drive_id = ? ORDER BY tg_id, seq`, [driveId]);
}

export async function hasPlan(driveId: number): Promise<boolean> {
  const r = await one<{ n: number }>(`SELECT COUNT(*) AS n FROM instalments WHERE drive_id = ?`, [driveId]);
  return Number(r?.n ?? 0) > 0;
}

export async function drivesWithPlans(): Promise<number[]> {
  const rows = await all<{ drive_id: number }>(`SELECT DISTINCT drive_id FROM instalments`);
  return rows.map((r) => Number(r.drive_id));
}

export function nextInstalment(driveId: number, tgId: string) {
  return one<InstalmentRow>(
    `SELECT * FROM instalments WHERE drive_id = ? AND tg_id = ? AND paid_at IS NULL ORDER BY seq LIMIT 1`,
    [driveId, tgId],
  );
}

export async function planCountFor(driveId: number, tgId: string): Promise<{ total: number; paid: number }> {
  const r = await one<{ total: number; paid: number | null }>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN paid_at IS NOT NULL THEN 1 ELSE 0 END) AS paid
     FROM instalments WHERE drive_id = ? AND tg_id = ?`,
    [driveId, tgId],
  );
  return { total: Number(r?.total ?? 0), paid: Number(r?.paid ?? 0) };
}

// Recomputes paid status from the payments table so it is self-correcting rather than drifting on retries.
export async function reconcileInstalments(driveId: number) {
  const rows = await instalmentsFor(driveId);
  if (!rows.length) return;
  const payments = await all<{ memo: string; amount: string; payer: string }>(
    `SELECT memo, amount, payer FROM payments WHERE drive_id = ?`,
    [driveId],
  );
  const paidBy = new Map<string, bigint>();
  for (const p of payments) {
    const m = /^tg:(\d+):/.exec(p.memo);
    const key = m ? m[1] : p.payer.toLowerCase();
    paidBy.set(key, (paidBy.get(key) ?? 0n) + BigInt(p.amount));
  }
  const ts = now();
  const byMember = new Map<string, InstalmentRow[]>();
  for (const r of rows) {
    const list = byMember.get(r.tg_id) ?? [];
    list.push(r);
    byMember.set(r.tg_id, list);
  }
  const writes: { sql: string; args: InValue[] }[] = [];
  for (const [tgId, list] of byMember) {
    const paid = paidBy.get(tgId) ?? 0n;
    let running = 0n;
    for (const r of list) {
      running += BigInt(r.amount);
      const settled = paid >= running;
      if (settled && r.paid_at === null) {
        writes.push({
          sql: `UPDATE instalments SET paid_at = ? WHERE drive_id = ? AND tg_id = ? AND seq = ?`,
          args: [ts, driveId, tgId, r.seq],
        });
      }
      if (!settled && r.paid_at !== null) {
        writes.push({
          sql: `UPDATE instalments SET paid_at = NULL WHERE drive_id = ? AND tg_id = ? AND seq = ?`,
          args: [driveId, tgId, r.seq],
        });
      }
    }
  }
  if (writes.length) await db.batch(writes, "write");
}

export function dueInstalments(atTs: number, nudgedBefore: number) {
  return all<DueInstalment>(
    `SELECT i.*, d.chat_id, d.label, d.token
     FROM instalments i JOIN drives d ON d.id = i.drive_id
     WHERE i.paid_at IS NULL AND d.closed = 0 AND i.due_at <= ?
       AND (i.nudged_at IS NULL OR i.nudged_at <= ?)
     ORDER BY i.drive_id, i.due_at, i.seq`,
    [atTs, nudgedBefore],
  );
}

export async function markNudged(driveId: number, tgId: string, seq: number, ts: number) {
  await run(`UPDATE instalments SET nudged_at = ? WHERE drive_id = ? AND tg_id = ? AND seq = ?`, [
    ts,
    driveId,
    tgId,
    seq,
  ]);
}

export async function addIntent(i: Omit<X402Intent, "forwarded_tx" | "created_at">) {
  await run(
    `INSERT OR IGNORE INTO x402_intents (id, drive_id, token, amount, payer_name, payer, nonce, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [i.id, i.drive_id, i.token, i.amount, i.payer_name, i.payer, i.nonce, now()],
  );
}

export function pendingIntents() {
  return all<X402Intent>(`SELECT * FROM x402_intents WHERE forwarded_tx IS NULL ORDER BY created_at`);
}

export async function markForwarded(id: string, tx: string) {
  await run(`UPDATE x402_intents SET forwarded_tx = ? WHERE id = ?`, [tx, id]);
}

export function getIntent(id: string) {
  return one<X402Intent>(`SELECT * FROM x402_intents WHERE id = ?`, [id]);
}

export type BillRow = {
  drive_id: number;
  category: string;
  service_id: string;
  network: string;
  billers_code: string;
  naira_amount: number;
  quoted: string;
  status: string;
  settle_tx: string | null;
  purchased_code: string | null;
  units: string | null;
  request_id: string | null;
  note: string | null;
  /** "USAT" or "USDT": what the drive collects and what AbaPay is paid in. */
  token: string;
  paid_amount: string | null;
  auth: string | null;
  intl: string | null;
  created_at: number;
  updated_at: number;
};

export async function insertBill(
  b: Pick<BillRow, "drive_id" | "category" | "service_id" | "network" | "billers_code" | "naira_amount" | "quoted" | "token"> & {
    intl?: string | null;
  },
) {
  await run(
    `INSERT INTO bills (drive_id, category, service_id, network, billers_code, naira_amount, quoted, token, intl, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'collecting', ?, ?)`,
    [b.drive_id, b.category, b.service_id, b.network, b.billers_code, b.naira_amount, b.quoted, b.token, b.intl ?? null, now(), now()],
  );
}

export function billsWithStatus(status: string) {
  return all<BillRow>(`SELECT * FROM bills WHERE status = ? ORDER BY drive_id`, [status]);
}

/**
 * Who really paid a contribution the agent made on someone's behalf: a swapped payment, an x402
 * payment, or a plain transfer the agent counted. Without this, change from a bill drive could not
 * go back to the person who sent it.
 */
export async function realPayerFor(txHash: string): Promise<string | undefined> {
  const swapped = await one<{ payer: string }>(`SELECT payer FROM corridor_intents WHERE contribute_tx = ?`, [txHash]);
  if (swapped) return swapped.payer;
  const x402 = await one<{ payer: string | null }>(`SELECT payer FROM x402_intents WHERE forwarded_tx = ?`, [txHash]);
  if (x402?.payer) return x402.payer;
  const direct = await one<{ payer: string }>(`SELECT payer FROM direct_payments WHERE lower(contribute_tx) = lower(?)`, [txHash]);
  return direct?.payer;
}

export function billsInFlight() {
  return all<BillRow>(`SELECT * FROM bills WHERE status IN ('collecting', 'paying', 'vending', 'awaiting_refund') ORDER BY drive_id`);
}

export type DirectRow = {
  pay_tx: string;
  payer: string;
  token: string;
  amount: string;
  block: number;
  block_time: number;
  drive_id: number | null;
  credit: string | null;
  refund_amount: string | null;
  contribute_tx: string | null;
  refund_tx: string | null;
  memo: string | null;
  status: string;
  notified: number;
  created_at: number;
};

export async function insertDirect(p: {
  pay_tx: string;
  payer: string;
  token: string;
  amount: string;
  block: number;
  block_time: number;
  status: string;
}): Promise<boolean> {
  const changes = await run(
    `INSERT OR IGNORE INTO direct_payments (pay_tx, payer, token, amount, block, block_time, status, notified, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [p.pay_tx.toLowerCase(), p.payer, p.token, p.amount, p.block, p.block_time, p.status, now()],
  );
  return changes > 0;
}

const DIRECT_FIELDS = new Set(["drive_id", "credit", "refund_amount", "contribute_tx", "refund_tx", "memo", "status", "notified"]);

export async function updateDirect(payTx: string, fields: Partial<Record<"drive_id" | "credit" | "refund_amount" | "contribute_tx" | "refund_tx" | "memo" | "status" | "notified", string | number | null>>) {
  const keys = Object.keys(fields).filter((k) => DIRECT_FIELDS.has(k));
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  await run(`UPDATE direct_payments SET ${sets} WHERE pay_tx = ?`, [...keys.map((k) => fields[k as keyof typeof fields] ?? null), payTx.toLowerCase()]);
}

export function getDirect(payTx: string) {
  return one<DirectRow>(`SELECT * FROM direct_payments WHERE pay_tx = ?`, [payTx.toLowerCase()]);
}

/** True when this contribute already belongs to a direct transfer, an x402 forward, or a swap. */
export async function contributeTxTaken(txHash: string): Promise<boolean> {
  const hash = txHash.toLowerCase();
  const direct = await one<{ pay_tx: string }>(`SELECT pay_tx FROM direct_payments WHERE lower(contribute_tx) = ?`, [hash]);
  if (direct) return true;
  const x402 = await one<{ id: string }>(`SELECT id FROM x402_intents WHERE lower(forwarded_tx) = ?`, [hash]);
  if (x402) return true;
  const swapped = await one<{ id: string }>(`SELECT id FROM corridor_intents WHERE lower(contribute_tx) = ?`, [hash]);
  return !!swapped;
}

export async function deleteDirect(payTx: string) {
  await run(`DELETE FROM direct_payments WHERE pay_tx = ?`, [payTx.toLowerCase()]);
}

/** Transfers that still need a decision, a refund, or the one message that explains them. */
export function unfinishedDirects() {
  return all<DirectRow>(
    `SELECT * FROM direct_payments
     WHERE status IN ('held', 'ambiguous', 'crediting') OR (status = 'noted' AND notified = 0)
     ORDER BY block ASC`,
  );
}

/** Transfers whose coins are still sitting in the agent wallet and must not be spent for someone else. */
export function directStillHeld() {
  return all<DirectRow>(
    `SELECT * FROM direct_payments
     WHERE status IN ('held', 'ambiguous', 'noted') OR (status = 'crediting' AND contribute_tx IS NULL)`,
  );
}

export function getBill(driveId: number) {
  return one<BillRow>(`SELECT * FROM bills WHERE drive_id = ?`, [driveId]);
}

const BILL_FIELDS = new Set(["settle_tx", "purchased_code", "units", "request_id", "note", "paid_amount", "auth"]);

export async function setBillStatus(driveId: number, status: string, fields: Record<string, string> = {}) {
  const keys = Object.keys(fields).filter((k) => BILL_FIELDS.has(k));
  const sets = ["status = ?", "updated_at = ?", ...keys.map((k) => `${k} = ?`)].join(", ");
  await run(`UPDATE bills SET ${sets} WHERE drive_id = ?`, [status, now(), ...keys.map((k) => fields[k]), driveId]);
}

export type CorridorRow = {
  id: string;
  drive_id: number;
  payer: string;
  pay_token: string;
  pay_amount: string;
  pay_tx: string;
  want_local: string;
  memo: string;
  status: string;
  swap_tx: string | null;
  contribute_tx: string | null;
  refund_tx: string | null;
  local_amount: string | null;
  note: string | null;
  created_at: number;
  updated_at: number;
};

/** Returns false when this payment transaction was already recorded, so a resubmit never pays twice. */
export async function addCorridorIntent(i: Omit<CorridorRow, "status" | "swap_tx" | "contribute_tx" | "refund_tx" | "local_amount" | "note" | "created_at" | "updated_at">) {
  const changed = await run(
    `INSERT OR IGNORE INTO corridor_intents (id, drive_id, payer, pay_token, pay_amount, pay_tx, want_local, memo, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?)`,
    [i.id, i.drive_id, i.payer, i.pay_token, i.pay_amount, i.pay_tx.toLowerCase(), i.want_local, i.memo, now(), now()],
  );
  return changed > 0;
}

const CORRIDOR_FIELDS = new Set(["swap_tx", "contribute_tx", "refund_tx", "local_amount", "note"]);

export async function setCorridorStatus(id: string, status: string, fields: Record<string, string> = {}) {
  const keys = Object.keys(fields).filter((k) => CORRIDOR_FIELDS.has(k));
  const sets = ["status = ?", "updated_at = ?", ...keys.map((k) => `${k} = ?`)].join(", ");
  await run(`UPDATE corridor_intents SET ${sets} WHERE id = ?`, [status, now(), ...keys.map((k) => fields[k]), id]);
}

export function getCorridorIntent(id: string) {
  return one<CorridorRow>(`SELECT * FROM corridor_intents WHERE id = ?`, [id]);
}

export function corridorByPayTx(payTx: string) {
  return one<CorridorRow>(`SELECT * FROM corridor_intents WHERE pay_tx = ?`, [payTx.toLowerCase()]);
}

/** Intents that arrived but never finished, e.g. because the process restarted mid-way. */
export function unsettledCorridorIntents() {
  return all<CorridorRow>(`SELECT * FROM corridor_intents WHERE status = 'received' ORDER BY created_at`);
}

export async function counts(): Promise<{ payments: number; payers: number }> {
  const r = await one<{ payments: number; payers: number }>(
    `SELECT COUNT(*) AS payments, COUNT(DISTINCT payer) AS payers FROM payments`,
  );
  return { payments: Number(r?.payments ?? 0), payers: Number(r?.payers ?? 0) };
}

export async function linkWallet(tgId: string, address: string) {
  await run(
    `INSERT INTO verifications (tg_id, address, linked_at) VALUES (?, ?, ?)
     ON CONFLICT(tg_id) DO UPDATE SET address = excluded.address, linked_at = excluded.linked_at`,
    [tgId, address, now()],
  );
}

export async function walletFor(tgId: string): Promise<string | undefined> {
  const r = await one<{ address: string }>(`SELECT address FROM verifications WHERE tg_id = ?`, [tgId]);
  return r?.address;
}

export async function tgForAddress(address: string): Promise<string | undefined> {
  const r = await one<{ tg_id: string }>(`SELECT tg_id FROM verifications WHERE lower(address) = lower(?)`, [address]);
  return r?.tg_id;
}

export async function getMeta(k: string): Promise<string | undefined> {
  const r = await one<{ v: string }>(`SELECT v FROM meta WHERE k = ?`, [k]);
  return r?.v;
}

export async function setMeta(k: string, v: string) {
  await run(`INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, [k, v]);
}

// --- buy -----------------------------------------------------------------------------------------

export type BuyCall = { service: string; amount: string; token: string; tx: string | null; ok: number; note: string | null; created_at: number };

export async function recordBuyCall(c: Omit<BuyCall, "created_at">) {
  await run(`INSERT INTO buy_calls (service, amount, token, tx, ok, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
    c.service,
    c.amount,
    c.token,
    c.tx,
    c.ok,
    c.note,
    now(),
  ]);
}

/** Atomic units of `token` signed away to buy since `since` (unix seconds). */
export async function buySpentSince(token: string, since: number): Promise<bigint> {
  const rows = await all<{ amount: string }>(`SELECT amount FROM buy_calls WHERE token = ? AND created_at >= ?`, [token, since]);
  return rows.reduce((a, r) => a + BigInt(r.amount), 0n);
}

/** Every call buy settled on chain, oldest first: the record of what Earmark has actually bought. */
export async function paidBuyCalls(): Promise<BuyCall[]> {
  return all<BuyCall>(`SELECT service, amount, token, tx, ok, note, created_at FROM buy_calls WHERE ok = 1 ORDER BY id ASC`);
}

export async function failedBuyCalls(limit = 20): Promise<BuyCall[]> {
  return all<BuyCall>(`SELECT service, amount, token, tx, ok, note, created_at FROM buy_calls WHERE ok = 0 ORDER BY id DESC LIMIT ?`, [limit]);
}

export async function recentBuyCalls(limit = 50): Promise<BuyCall[]> {
  return all<BuyCall>(`SELECT service, amount, token, tx, ok, note, created_at FROM buy_calls ORDER BY id DESC LIMIT ?`, [limit]);
}
