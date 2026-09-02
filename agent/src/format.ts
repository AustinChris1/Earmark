import { formatUnits } from "viem";
import { tokenByAddress, type TokenInfo } from "./config.js";
import type { DriveRow, InstalmentRow, PaymentRow, ShareRow } from "./db.js";

export function fmt(amount: bigint | string, token: TokenInfo): string {
  const n = Number(formatUnits(BigInt(amount), token.decimals));
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${token.symbol}`;
}

export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function memoName(memo: string, payer: string): string {
  const m = /^tg:(\d+):(.*)$/.exec(memo);
  if (m && m[2]) return m[2];
  if (memo) return memo;
  return shortAddr(payer);
}

export function memoTgId(memo: string): string | null {
  const m = /^tg:(\d+):/.exec(memo);
  return m ? m[1] : null;
}

export function sumPaid(payments: PaymentRow[]): bigint {
  return payments.reduce((acc, p) => acc + BigInt(p.amount), 0n);
}

export function driveCard(d: DriveRow, payments: PaymentRow[], publicUrl: string): string {
  const token = tokenByAddress(d.token)!;
  const raised = sumPaid(payments);
  const target = BigInt(d.target);
  const lines = [
    `📌 <b>${escape(d.label)}</b>`,
    `Destination (locked): <code>${d.destination}</code>`,
    target > 0n ? `Raised: <b>${fmt(raised, token)}</b> of ${fmt(target, token)}` : `Raised: <b>${fmt(raised, token)}</b>`,
  ];
  if (d.deadline) lines.push(`Deadline: ${new Date(d.deadline * 1000).toUTCString()}`);
  lines.push(`Pay: ${publicUrl}/d/${d.id}`);
  if (d.closed) lines.push(`Status: closed`);
  return lines.join("\n");
}

export function tallyText(d: DriveRow, payments: PaymentRow[], shares: ShareRow[]): string {
  const token = tokenByAddress(d.token)!;
  const raised = sumPaid(payments);
  const target = BigInt(d.target);
  const byPayer = new Map<string, bigint>();
  for (const p of payments) {
    const key = memoName(p.memo, p.payer);
    byPayer.set(key, (byPayer.get(key) ?? 0n) + BigInt(p.amount));
  }
  const paidTg = new Set(payments.map((p) => memoTgId(p.memo)).filter(Boolean));
  const lines = [`🧾 <b>${escape(d.label)}</b>`];
  for (const [name, amt] of byPayer) lines.push(`✅ ${escape(name)}: ${fmt(amt, token)}`);
  const outstanding = shares.filter((s) => !paidTg.has(s.tg_id));
  for (const s of outstanding) lines.push(`⏳ ${escape(s.name)}: ${fmt(s.amount, token)} outstanding`);
  lines.push(
    target > 0n
      ? `Total: <b>${fmt(raised, token)}</b> / ${fmt(target, token)} (${fmt(target - raised, token)} to go)`
      : `Total: <b>${fmt(raised, token)}</b>`,
  );
  return lines.join("\n");
}

export function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function dueLabel(ts: number): string {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const days = Math.round((ts * 1000 - startOfToday) / 86_400_000);
  if (days <= 0) return "due now";
  if (days === 1) return "due tomorrow";
  return `due ${new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

export function planText(d: DriveRow, inst: InstalmentRow[]): string {
  const token = tokenByAddress(d.token)!;
  const byMember = new Map<string, InstalmentRow[]>();
  for (const r of inst) {
    const list = byMember.get(r.tg_id) ?? [];
    list.push(r);
    byMember.set(r.tg_id, list);
  }
  const lines = [`🗓 <b>${escape(d.label)}</b> instalment plan`];
  for (const [, rows] of byMember) {
    const paid = rows.filter((r) => r.paid_at !== null).length;
    const next = rows.find((r) => r.paid_at === null);
    const tail = next ? `next ${fmt(next.amount, token)} ${dueLabel(next.due_at)}` : "complete";
    lines.push(`${paid === rows.length ? "✅" : "•"} ${escape(rows[0].name)}: ${paid}/${rows.length} paid, ${tail}`);
  }
  return lines.join("\n");
}
