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
  return db.prepare(`SELECT * FROM drives WHERE chat_id = ? ORDER BY id DESC LIMIT 1`).get(chatId) as DriveRow | undefined;
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

export function getMeta(k: string): string | undefined {
  const row = db.prepare(`SELECT v FROM meta WHERE k = ?`).get(k) as { v: string } | undefined;
  return row?.v;
}

export function setMeta(k: string, v: string) {
  db.prepare(`INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).run(k, v);
}
