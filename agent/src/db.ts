import { DatabaseSync } from "node:sqlite";
import { env } from "./config.js";

export const db = new DatabaseSync(env.DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS drives (
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
);
CREATE TABLE IF NOT EXISTS payments (
  tx_hash TEXT PRIMARY KEY,
  drive_id INTEGER NOT NULL,
  payer TEXT NOT NULL,
  amount TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  block INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS shares (
  drive_id INTEGER NOT NULL,
  tg_id TEXT NOT NULL,
  name TEXT NOT NULL,
  amount TEXT NOT NULL,
  PRIMARY KEY (drive_id, tg_id)
);
CREATE TABLE IF NOT EXISTS instalments (
  drive_id INTEGER NOT NULL,
  tg_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  name TEXT NOT NULL,
  amount TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  paid_at INTEGER,
  nudged_at INTEGER,
  PRIMARY KEY (drive_id, tg_id, seq)
);
CREATE TABLE IF NOT EXISTS x402_intents (
  id TEXT PRIMARY KEY,
  drive_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  amount TEXT NOT NULL,
  payer_name TEXT NOT NULL,
  forwarded_tx TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`);

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

const now = () => Math.floor(Date.now() / 1000);

export function insertDrive(d: Omit<DriveRow, "created_at" | "closed" | "token_symbol" | "token_decimals">) {
  db.prepare(
    `INSERT INTO drives (id, chat_id, label, token, destination, target, deadline, collector_tg, collector_name, created_tx, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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
  );
}

export function getDrive(id: number): DriveRow | undefined {
  return db.prepare(`SELECT * FROM drives WHERE id = ?`).get(id) as DriveRow | undefined;
}

export function openDrivesForChat(chatId: string): DriveRow[] {
  return db.prepare(`SELECT * FROM drives WHERE chat_id = ? AND closed = 0 ORDER BY id DESC`).all(chatId) as DriveRow[];
}

export function latestDriveForChat(chatId: string): DriveRow | undefined {
  return db.prepare(`SELECT * FROM drives WHERE chat_id = ? ORDER BY id DESC LIMIT 1`).get(chatId) as
    | DriveRow
    | undefined;
}

export function markClosed(id: number) {
  db.prepare(`UPDATE drives SET closed = 1 WHERE id = ?`).run(id);
}

export function insertPayment(p: Omit<PaymentRow, "created_at">): boolean {
  const r = db
    .prepare(
      `INSERT OR IGNORE INTO payments (tx_hash, drive_id, payer, amount, memo, block, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(p.tx_hash, p.drive_id, p.payer, p.amount, p.memo, p.block, now());
  return r.changes > 0;
}

export function paymentsFor(driveId: number): PaymentRow[] {
  return db.prepare(`SELECT * FROM payments WHERE drive_id = ? ORDER BY block ASC`).all(driveId) as PaymentRow[];
}

export function setShare(s: ShareRow) {
  db.prepare(
    `INSERT INTO shares (drive_id, tg_id, name, amount) VALUES (?, ?, ?, ?)
     ON CONFLICT(drive_id, tg_id) DO UPDATE SET name = excluded.name, amount = excluded.amount`,
  ).run(s.drive_id, s.tg_id, s.name, s.amount);
}

export function sharesFor(driveId: number): ShareRow[] {
  return db.prepare(`SELECT * FROM shares WHERE drive_id = ?`).all(driveId) as ShareRow[];
}

// A /split can only key on @username; the first /pay from that person swaps in their numeric id so payments match.
export function rekeyMember(driveId: number, from: string, to: string, name: string) {
  if (from === to) return;
  db.prepare(`UPDATE OR REPLACE shares SET tg_id = ?, name = ? WHERE drive_id = ? AND tg_id = ?`).run(
    to,
    name,
    driveId,
    from,
  );
  db.prepare(`UPDATE OR REPLACE instalments SET tg_id = ?, name = ? WHERE drive_id = ? AND tg_id = ?`).run(
    to,
    name,
    driveId,
    from,
  );
}

export function replacePlan(driveId: number, rows: Omit<InstalmentRow, "paid_at" | "nudged_at">[]) {
  db.prepare(`DELETE FROM instalments WHERE drive_id = ?`).run(driveId);
  const stmt = db.prepare(
    `INSERT INTO instalments (drive_id, tg_id, seq, name, amount, due_at) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const r of rows) stmt.run(r.drive_id, r.tg_id, r.seq, r.name, r.amount, r.due_at);
}

export function instalmentsFor(driveId: number): InstalmentRow[] {
  return db.prepare(`SELECT * FROM instalments WHERE drive_id = ? ORDER BY tg_id, seq`).all(driveId) as InstalmentRow[];
}

export function hasPlan(driveId: number): boolean {
  const r = db.prepare(`SELECT COUNT(*) AS n FROM instalments WHERE drive_id = ?`).get(driveId) as { n: number };
  return r.n > 0;
}

export function drivesWithPlans(): number[] {
  return (db.prepare(`SELECT DISTINCT drive_id FROM instalments`).all() as { drive_id: number }[]).map(
    (r) => r.drive_id,
  );
}

export function nextInstalment(driveId: number, tgId: string): InstalmentRow | undefined {
  return db
    .prepare(`SELECT * FROM instalments WHERE drive_id = ? AND tg_id = ? AND paid_at IS NULL ORDER BY seq LIMIT 1`)
    .get(driveId, tgId) as InstalmentRow | undefined;
}

export function planCountFor(driveId: number, tgId: string): { total: number; paid: number } {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN paid_at IS NOT NULL THEN 1 ELSE 0 END) AS paid
       FROM instalments WHERE drive_id = ? AND tg_id = ?`,
    )
    .get(driveId, tgId) as { total: number; paid: number | null };
  return { total: r.total, paid: r.paid ?? 0 };
}

// Recomputes paid status from the payments table so it is self-correcting rather than drifting on retries.
export function reconcileInstalments(driveId: number) {
  const rows = instalmentsFor(driveId);
  if (!rows.length) return;
  const payments = db.prepare(`SELECT memo, amount, payer FROM payments WHERE drive_id = ?`).all(driveId) as {
    memo: string;
    amount: string;
    payer: string;
  }[];
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
  const setPaid = db.prepare(`UPDATE instalments SET paid_at = ? WHERE drive_id = ? AND tg_id = ? AND seq = ?`);
  const clearPaid = db.prepare(`UPDATE instalments SET paid_at = NULL WHERE drive_id = ? AND tg_id = ? AND seq = ?`);
  for (const [tgId, list] of byMember) {
    const paid = paidBy.get(tgId) ?? 0n;
    let running = 0n;
    for (const r of list) {
      running += BigInt(r.amount);
      const settled = paid >= running;
      if (settled && r.paid_at === null) setPaid.run(ts, driveId, tgId, r.seq);
      if (!settled && r.paid_at !== null) clearPaid.run(driveId, tgId, r.seq);
    }
  }
}

export function dueInstalments(atTs: number, nudgedBefore: number): DueInstalment[] {
  return db
    .prepare(
      `SELECT i.*, d.chat_id, d.label, d.token
       FROM instalments i JOIN drives d ON d.id = i.drive_id
       WHERE i.paid_at IS NULL AND d.closed = 0 AND i.due_at <= ?
         AND (i.nudged_at IS NULL OR i.nudged_at <= ?)
       ORDER BY i.drive_id, i.due_at, i.seq`,
    )
    .all(atTs, nudgedBefore) as DueInstalment[];
}

export function markNudged(driveId: number, tgId: string, seq: number, ts: number) {
  db.prepare(`UPDATE instalments SET nudged_at = ? WHERE drive_id = ? AND tg_id = ? AND seq = ?`).run(
    ts,
    driveId,
    tgId,
    seq,
  );
}

export type X402Intent = {
  id: string;
  drive_id: number;
  token: string;
  amount: string;
  payer_name: string;
  forwarded_tx: string | null;
  created_at: number;
};

export function addIntent(i: Omit<X402Intent, "forwarded_tx" | "created_at">) {
  db.prepare(
    `INSERT OR IGNORE INTO x402_intents (id, drive_id, token, amount, payer_name, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(i.id, i.drive_id, i.token, i.amount, i.payer_name, now());
}

export function pendingIntents(): X402Intent[] {
  return db
    .prepare(`SELECT * FROM x402_intents WHERE forwarded_tx IS NULL ORDER BY created_at`)
    .all() as X402Intent[];
}

export function markForwarded(id: string, tx: string) {
  db.prepare(`UPDATE x402_intents SET forwarded_tx = ? WHERE id = ?`).run(tx, id);
}

export function getIntent(id: string): X402Intent | undefined {
  return db.prepare(`SELECT * FROM x402_intents WHERE id = ?`).get(id) as X402Intent | undefined;
}

export function getMeta(k: string): string | undefined {
  const row = db.prepare(`SELECT v FROM meta WHERE k = ?`).get(k) as { v: string } | undefined;
  return row?.v;
}

export function setMeta(k: string, v: string) {
  db.prepare(`INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).run(k, v);
}
