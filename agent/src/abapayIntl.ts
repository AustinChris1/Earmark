/**
 * International airtime through AbaPay: 140+ countries, Argentina's Claro, Movistar and Personal and
 * Brazil's Claro, TIM and Vivo among them. AbaPay proxies VTpass's live catalogue at /api/intl; the
 * same x402 endpoint Earmark already pays Nigerian bills through vends it, settled in USA₮ or USD₮
 * on Celo. Only fixed-price plans are offered: a plan's price is then set by its code, not by
 * anything a person typed.
 */

const INTL = process.env.ABAPAY_INTL ?? "https://agents.abapays.com/api/intl";

/** "Mobile Top Up" in VTpass's product types; Pin/Voucher and data plans are left out for now. */
export const TOP_UP = "1";

export type IntlCountry = { code: string; name: string; currency: string; prefix: string };
export type IntlOperator = { id: string; name: string };
export type IntlPlan = { code: string; name: string; amount: string; currency: string; naira: number };

const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 10 * 60 * 1000;

async function get<T>(params: Record<string, string>, read: (content: unknown) => T): Promise<T> {
  const key = JSON.stringify(params);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  const r = await fetch(`${INTL}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`AbaPay's catalogue answered ${r.status}.`);
  const body = (await r.json()) as { response_description?: string; content?: unknown };
  const value = read(body.content);
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function intlCountries(): Promise<IntlCountry[]> {
  return get({ action: "countries" }, (c) => {
    // The countries list is nested one level deeper than every other answer.
    const raw = (c as { countries?: unknown[] })?.countries ?? (Array.isArray(c) ? c : []);
    return (raw as Record<string, string>[])
      .filter((x) => x.code && x.name)
      .map((x) => ({ code: x.code, name: x.name, currency: x.currency ?? "", prefix: String(x.prefix ?? "") }))
      .filter((x) => x.code !== "NG")
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

export async function intlCountry(code: string): Promise<IntlCountry | undefined> {
  const k = code.trim().toLowerCase();
  return (await intlCountries()).find((c) => c.code.toLowerCase() === k || c.name.toLowerCase() === k);
}

export function intlOperators(country: string): Promise<IntlOperator[]> {
  return get({ action: "operators", code: country, type_id: TOP_UP }, (c) =>
    ((Array.isArray(c) ? c : []) as Record<string, string>[]).map((o) => ({
      id: String(o.operator_id),
      // "Argentina Claro" reads as "Claro" once the country is already chosen.
      name: String(o.name),
    })),
  );
}

export function intlPlans(operatorId: string): Promise<IntlPlan[]> {
  return get({ action: "variations", operator_id: operatorId, type_id: TOP_UP }, (c) => {
    const content = (c ?? {}) as { currency?: string; variations?: Record<string, unknown>[] };
    return (content.variations ?? [])
      .filter((v) => v.fixedPrice === "Yes" && Number(v.charged_amount) > 0)
      .map((v) => ({
        code: String(v.variation_code),
        name: String(v.name),
        amount: String(v.variation_amount),
        currency: content.currency ?? "",
        naira: Number(v.charged_amount),
      }))
      .sort((a, b) => a.naira - b.naira);
  });
}

/**
 * A phone number abroad in full international form, digits only: "+54 9 11 2345-6789",
 * "0054 9 11…" and "9 11 2345 6789" typed for Argentina all become "5491123456789".
 */
export function intlNumber(prefix: string, raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("00")) d = d.slice(2);
  if (!raw.trim().startsWith("+") && !raw.trim().startsWith("00") && !d.startsWith(prefix)) d = prefix + d.replace(/^0+/, "");
  return /^\d{8,15}$/.test(d) && d.startsWith(prefix) ? d : null;
}

/** The operator name without the country in front: "Argentina Claro" -> "Claro". */
export function shortOperator(name: string, country: IntlCountry): string {
  return name.startsWith(`${country.name} `) ? name.slice(country.name.length + 1) : name;
}
