import type { Address } from "viem";

export type TokenInfo = { symbol: string; address: Address; decimals: number; feeCurrency: Address | null };

export type Payment = { tx: string; payer: Address; name: string; amount: string; block: number };

export type Instalment = { seq: number; count: number; paid: number; amount: string; dueAt: number };

export type Drive = {
  you: Instalment | null;
  id: number;
  label: string;
  token: TokenInfo;
  destination: Address;
  collector: Address;
  target: string;
  raised: string;
  deadline: number;
  closed: boolean;
  earmark: Address;
  tag: string;
  chainId: number;
  rpcUrl: string;
  explorer: string;
  chat: { collectorName: string | null } | null;
  payments: Payment[];
};

export type Stats = { drives: number; payments: number; payers: number; agent: Address; earmark: Address };

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body as T;
}

export const getDrive = (id: number | string, u = "") =>
  get<Drive>(`/api/drive/${id}${u ? `?u=${encodeURIComponent(u)}` : ""}`);
export const getStats = () => get<Stats>(`/api/stats`);

export type DriveSummary = {
  id: number;
  label: string;
  token: TokenInfo;
  destination: Address;
  collector: Address;
  target: string;
  raised: string;
  closed: boolean;
};

export const getDrives = () => get<DriveSummary[]>(`/api/drives`);
export const getConfig = () => get<import("./wallet").Config>(`/api/config`);
