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
];

export async function migrate() {
  for (const sql of SCHEMA) await db.execute(sql);
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
    `INSERT OR IGNORE INTO x402_intents (id, drive_id, token, amount, payer_name, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [i.id, i.drive_id, i.token, i.amount, i.payer_name, now()],
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

export async function getMeta(k: string): Promise<string | undefined> {
  const r = await one<{ v: string }>(`SELECT v FROM meta WHERE k = ?`, [k]);
  return r?.v;
}

export async function setMeta(k: string, v: string) {
  await run(`INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, [k, v]);
}
