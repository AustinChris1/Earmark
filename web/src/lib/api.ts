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
  /** Present when Ripio ramps this coin: the country it serves, and the payee's cash-out link. */
  ramp: { country: string; offramp: string } | null;
  /** Present on a bill drive: Earmark pays this provider itself when the drive fills. */
  bill: {
    provider: string;
    category: string;
    number: string;
    naira: number;
    status: string;
    settleTx: string | null;
    /** Opened from a wallet on the website: that wallet signs to see the token. */
    openedOnWeb: boolean;
  } | null;
  /** Pays Earmark's own wallet with no bill behind it: nothing would ever pay it out. */
  unattached: boolean;
  /** Other coins this drive can be paid in; Earmark swaps them into the drive's coin. */
  payOptions: string[];
  payments: Payment[];
};

/** How a coin is written for people: Tether's own spelling for its two dollars. */
export function coinName(symbol: string): string {
  return symbol === "USAT" ? "USA₮" : symbol === "USDT" ? "USD₮" : symbol;
}

export type BillProvider = { key: string; label: string; category: "ELECTRICITY" | "AIRTIME" };

export type BillQuote = {
  coin: "USAT" | "USDT";
  token: Address;
  decimals: number;
  quoted: string;
  target: string;
  targetHuman: string;
  label: string;
  payee: Address;
  number: string;
  /** What the opener signs once the drive exists, with its id in place of {id}. */
  sign: string;
};

export type BillReceipt = { number: string; status: string; purchasedCode: string | null; units: string | null; settleTx: string | null };

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((out as { error?: string }).error ?? `HTTP ${r.status}`);
  return out as T;
}

export const getBillProviders = () => get<BillProvider[]>(`/api/bills/providers`);
export const getBillQuote = (q: { provider: string; number: string; naira: number; coin: string }) =>
  get<BillQuote>(`/api/bills/quote?${new URLSearchParams({ ...q, naira: String(q.naira) })}`);
export const attachBill = (b: { driveId: number; provider: string; number: string; naira: number; coin: string; signature: string }) =>
  post<{ ok: true }>(`/api/bills`, b);
export const getBillReceipt = (driveId: number, signature: string) => post<BillReceipt>(`/api/drive/${driveId}/receipt`, { signature });

export type Stats = {
  drives: number;
  payments: number;
  payers: number;
  featured: { id: number; label: string } | null;
  agent: Address;
  earmark: Address;
};

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
  test?: boolean;
};

export const getDrives = () => get<DriveSummary[]>(`/api/drives`);
export const getConfig = () => get<import("./wallet").Config>(`/api/config`);
