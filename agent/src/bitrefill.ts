import { env } from "./config.js";

/**
 * Bitrefill: a second source for phone top-ups, so bills do not depend on one provider.
 *
 * Different shape from AbaPay. AbaPay answers a 402 and the agent signs one EIP-3009
 * authorisation on Celo, with no account. Bitrefill needs an account and an API key, and it
 * settles in USDC on Base, Arbitrum or Polygon, never on Celo. So a top-up bought here is paid
 * either from a prefunded Bitrefill balance or by sending USDC on another chain to an invoice
 * address. Collections, locked destinations and swaps stay on Celo; only this one leg moves.
 *
 * Nothing here spends money on its own: `quote` reads the catalogue, and `order` is only
 * reached when BITREFILL_SPEND is on, which it is not by default.
 *
 * Docs: https://docs.bitrefill.com
 */

const BASE = process.env.BITREFILL_API ?? "https://api.bitrefill.com/v2";

/** What Bitrefill can be paid with. No Celo option exists, which is why a float is needed. */
export const PAY_METHODS = [
  "balance",
  "usdc_base",
  "usdc_arbitrum",
  "usdc_polygon",
  "usdc_erc20",
  "usdt_erc20",
  "usdt_polygon",
] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

export type Operator = {
  id: string;
  name: string;
  country: string;
  /** What the phone receives, e.g. GHS for Ghana. */
  currency: string;
  inStock: boolean;
  /** A phone top-up, as opposed to a gift card or a voucher. */
  phone: boolean;
  /** Any amount between min and max, when the operator allows a free amount. */
  range: { min: number; max: number; step: number } | null;
  /**
   * How many units of the account's billing currency one unit of `currency` costs. About 0.92 for
   * a Nigerian account buying naira airtime (a discount); about 105 for the same account buying
   * Ghanaian cedis, because that is the exchange rate, not a markup.
   */
  rate: number | null;
  /** Fixed denominations. `value` is what the phone gets; `price` is in the billing currency. */
  packages: { id: string; label: string; value: number; price: number }[];
};

export type TopUpQuote = {
  provider: "bitrefill";
  operator: Operator;
  /** The face value that lands on the phone, in the operator's own currency. */
  value: number;
  currency: string;
  /** What a human sees on the package, e.g. "1.5gb weekly" for a data bundle. */
  label: string;
  /**
   * What Bitrefill charges, in **the account's billing currency**, which the account's country
   * sets. It is not `currency` unless the two happen to match, so never show it next to `value`
   * without saying which is which.
   */
  price: number;
  /** The package id to order, when this operator sells fixed denominations. */
  packageId: string | null;
};

export class BitrefillError extends Error {}

function key(): string {
  if (!env.BITREFILL_API_KEY) throw new BitrefillError("BITREFILL_API_KEY is not set.");
  return env.BITREFILL_API_KEY;
}

export function enabled(): boolean {
  return !!env.BITREFILL_API_KEY;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await r.json().catch(() => ({}))) as { data?: T; message?: string; error?: string };
  if (!r.ok) throw new BitrefillError(body.error ?? body.message ?? `Bitrefill ${path} answered ${r.status}.`);
  return (body.data ?? body) as T;
}

type RawProduct = {
  id: string;
  name: string;
  country_code: string;
  currency: string;
  in_stock?: boolean;
  recipient_type?: string;
  categories?: string[];
  range?: { min: number; max: number; step: number; price_rate?: number };
  /** `value` is a number for airtime and a label like "1.5gb weekly" for data, where `amount` holds the number. */
  packages?: { id: string; value: string | number; price: number; amount?: number }[];
};

/** Exported for tests: turns Bitrefill's product into the shape the rest of the agent uses. */
export function toOperator(p: RawProduct): Operator {
  return {
    id: p.id,
    name: p.name,
    country: p.country_code,
    currency: p.currency,
    inStock: p.in_stock !== false,
    phone: p.recipient_type === "phone_number",
    range: p.range ? { min: p.range.min, max: p.range.max, step: p.range.step || 1 } : null,
    rate: p.range?.price_rate ?? null,
    packages: (p.packages ?? [])
      .map((k) => ({
        id: k.id,
        label: String(k.value),
        // A data bundle's value is a label, so its face value lives in `amount`.
        value: Number.isFinite(Number(k.value)) ? Number(k.value) : Number(k.amount ?? NaN),
        price: Number(k.price),
      }))
      .filter((k) => Number.isFinite(k.value) && Number.isFinite(k.price)),
  };
}

/** Phone top-up operators in a country, cheapest-to-reach first. In-stock only. */
export async function operators(country: string): Promise<Operator[]> {
  const d = await call<RawProduct[]>(`/products?country=${encodeURIComponent(country.toUpperCase())}&category=refill&limit=50`);
  return d.map(toOperator).filter((o) => o.phone && o.inStock);
}

export async function operator(id: string): Promise<Operator> {
  return toOperator(await call<RawProduct>(`/products/${encodeURIComponent(id)}`));
}

/**
 * Picks what to buy for a wanted face value: the exact package when one matches, otherwise the
 * cheapest package at or above it, otherwise a free amount when the operator allows one.
 * Exported for tests, which is why it takes an operator rather than fetching one.
 */
export function priceFor(op: Operator, value: number): TopUpQuote {
  if (!op.inStock) throw new BitrefillError(`${op.name} is out of stock at Bitrefill.`);
  const exact = op.packages.find((k) => k.value === value);
  const above = op.packages.filter((k) => k.value >= value).sort((a, b) => a.value - b.value)[0];
  const pick = exact ?? above;
  if (pick) {
    return { provider: "bitrefill", operator: op, value: pick.value, currency: op.currency, label: pick.label, price: pick.price, packageId: pick.id };
  }
  if (op.range && value >= op.range.min && value <= op.range.max) {
    // No package, so the price is the face value converted at the operator's own rate.
    const price = op.rate ? Math.ceil(value * op.rate) : value;
    return { provider: "bitrefill", operator: op, value, currency: op.currency, label: String(value), price, packageId: null };
  }
  const limit = op.range ? `${op.range.min}–${op.range.max}` : op.packages.map((k) => k.value).join(", ");
  throw new BitrefillError(`${op.name} does not sell ${value} ${op.currency}. It offers ${limit}.`);
}

export async function quote(operatorId: string, value: number): Promise<TopUpQuote> {
  return priceFor(await operator(operatorId), value);
}

export async function balance(): Promise<{ balance: number; currency: string }> {
  return call<{ balance: number; currency: string }>("/accounts/balance");
}

export type Invoice = {
  id: string;
  status: string;
  /** Where to send the crypto, when the invoice is not paid from the account balance. */
  payment?: { address?: string; amount?: string; currency?: string; method?: string };
  orders?: { id: string; status: string; value?: string }[];
};

/**
 * Buys a top-up. Guarded twice: the key must exist, and BITREFILL_SPEND must be on, because an
 * invoice paid from the account balance is money gone with no confirmation step.
 */
export async function order(q: TopUpQuote, phone: string, method: PayMethod = "balance"): Promise<Invoice> {
  if (env.BITREFILL_SPEND !== "1") {
    throw new BitrefillError("Bitrefill spending is off. Set BITREFILL_SPEND=1 once a balance or float exists.");
  }
  if (!/^\+?\d{6,15}$/.test(phone)) throw new BitrefillError("A phone number in international form is needed.");
  return call<Invoice>("/invoices", {
    method: "POST",
    body: JSON.stringify({
      products: [
        q.packageId
          ? { product_id: q.operator.id, package_id: q.packageId, quantity: 1, send_email: false, phone_number: phone }
          : { product_id: q.operator.id, value: q.value, quantity: 1, send_email: false, phone_number: phone },
      ],
      payment_method: method,
    }),
  });
}

export async function invoice(id: string): Promise<Invoice> {
  return call<Invoice>(`/invoices/${encodeURIComponent(id)}`);
}
