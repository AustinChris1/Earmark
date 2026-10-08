import { getAddress, type Address } from "viem";
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { tokenBySymbol } from "./config.js";
import { account } from "./chain.js";

/**
 * AbaPay pays Nigerian bills (airtime, electricity, cable) for whoever settles its x402 challenge.
 * No account, API key or PIN on this path: the agent's wallet signs one EIP-3009 authorisation and
 * AbaPay vends the bill. https://agents.abapays.com/skill.md
 *
 * One trap, verified live: the token must be the exact string "USA₮" or "USD₮". Anything else,
 * plain "USAT" included, silently settles in USDC. So the asset AbaPay names is checked against the
 * coin the drive collected before anything is signed.
 */

const ENDPOINT = process.env.ABAPAY_X402 ?? "https://agents.abapays.com/api/pay/x402";

export type BillCategory = "AIRTIME" | "ELECTRICITY" | "CABLE";

export type Bill = {
  category: BillCategory;
  /** AbaPay / VTpass service id, e.g. "ikeja-electric", "mtn". */
  serviceID: string;
  /** Provider name, e.g. "IKEJA-ELECTRIC", "MTN". */
  network: string;
  /** Meter, phone or smartcard number. */
  billersCode: string;
  nairaAmount: number;
};

// The providers a group is most likely to share a bill with. Electricity ids follow VTpass.
export const PROVIDERS: Record<string, { serviceID: string; network: string; category: BillCategory; label: string }> = {
  ikeja: { serviceID: "ikeja-electric", network: "IKEJA-ELECTRIC", category: "ELECTRICITY", label: "Ikeja Electric" },
  eko: { serviceID: "eko-electric", network: "EKO-ELECTRIC", category: "ELECTRICITY", label: "Eko Electric" },
  abuja: { serviceID: "abuja-electric", network: "ABUJA-ELECTRIC", category: "ELECTRICITY", label: "Abuja Electric" },
  ibadan: { serviceID: "ibadan-electric", network: "IBADAN-ELECTRIC", category: "ELECTRICITY", label: "Ibadan Electric" },
  enugu: { serviceID: "enugu-electric", network: "ENUGU-ELECTRIC", category: "ELECTRICITY", label: "Enugu Electric" },
  portharcourt: { serviceID: "portharcourt-electric", network: "PORTHARCOURT-ELECTRIC", category: "ELECTRICITY", label: "Port Harcourt Electric" },
  kano: { serviceID: "kano-electric", network: "KANO-ELECTRIC", category: "ELECTRICITY", label: "Kano Electric" },
  kaduna: { serviceID: "kaduna-electric", network: "KADUNA-ELECTRIC", category: "ELECTRICITY", label: "Kaduna Electric" },
  jos: { serviceID: "jos-electric", network: "JOS-ELECTRIC", category: "ELECTRICITY", label: "Jos Electric" },
  benin: { serviceID: "benin-electric", network: "BENIN-ELECTRIC", category: "ELECTRICITY", label: "Benin Electric" },
  aba: { serviceID: "aba-electric", network: "ABA-ELECTRIC", category: "ELECTRICITY", label: "Aba Power" },
  yola: { serviceID: "yola-electric", network: "YOLA-ELECTRIC", category: "ELECTRICITY", label: "Yola Electric" },
  mtn: { serviceID: "mtn", network: "MTN", category: "AIRTIME", label: "MTN airtime" },
  airtel: { serviceID: "airtel", network: "AIRTEL", category: "AIRTIME", label: "Airtel airtime" },
  glo: { serviceID: "glo", network: "GLO", category: "AIRTIME", label: "Glo airtime" },
  "9mobile": { serviceID: "etisalat", network: "9MOBILE", category: "AIRTIME", label: "9mobile airtime" },
};

/** AbaPay's own spelling of each coin. */
const ABAPAY_TOKEN: Record<string, string> = { USAT: "USA₮", USDT: "USD₮", USDC: "USDC" };

export type BillQuote = { asset: Address; amount: bigint; payTo: Address };

function body(bill: Bill, symbol: string) {
  const token = ABAPAY_TOKEN[symbol];
  if (!token) throw new Error(`AbaPay settles in USA₮, USD₮ or USDC, not ${symbol}.`);
  return {
    serviceID: bill.serviceID,
    serviceCategory: bill.category,
    network: bill.network,
    billersCode: bill.billersCode,
    nairaAmount: bill.nairaAmount,
    token,
    blockchain: "CELO",
    wallet_address: account.address,
  };
}

const http = new x402HTTPClient(
  registerExactEvmScheme(new x402Client().setSpendControls(false), { signer: account, networks: ["eip155:42220"] }),
);

async function post(payload: object, headers: Record<string, string> = {}) {
  return fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90_000),
  });
}

/** Reads the 402 challenge and refuses it unless it asks for the coin the drive actually holds. */
export function checkChallenge(
  accepts: { asset?: string; amount?: string; maxAmountRequired?: string; payTo?: string; network?: string }[],
  expected: Address,
): BillQuote {
  const a = accepts.find((x) => x.network === "eip155:42220" || x.network === "celo") ?? accepts[0];
  if (!a?.asset || !a.payTo) throw new Error("AbaPay did not name a price.");
  if (a.asset.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`AbaPay asked for ${a.asset}, not the ${expected} this drive collected; nothing was signed.`);
  }
  const amount = BigInt(a.maxAmountRequired ?? a.amount ?? "0");
  if (amount <= 0n) throw new Error("AbaPay quoted a zero price.");
  return { asset: getAddress(a.asset), amount, payTo: getAddress(a.payTo) };
}

/** The live price of a bill in `symbol`, from AbaPay's 402. Nothing is paid. */
export async function quoteBill(bill: Bill, symbol: "USAT" | "USDT"): Promise<BillQuote> {
  const coin = tokenBySymbol(symbol)!;
  const r = await post(body(bill, symbol));
  if (r.status !== 402) throw new Error(`AbaPay answered ${r.status} where a price was expected.`);
  const required = http.getPaymentRequiredResponse((h) => r.headers.get(h), await r.json().catch(() => undefined));
  return checkChallenge(required.accepts as never, coin.address);
}

export type BillResult = {
  ok: boolean;
  status: string;
  purchasedCode: string | null;
  units: string | null;
  settleTx: string | null;
  requestId: string | null;
  quote: BillQuote;
};

/**
 * Pays the bill from the agent wallet. `maxAmount` is what the drive raised; if AbaPay's price has
 * moved above it, nothing is signed.
 */
export async function payBill(bill: Bill, symbol: "USAT" | "USDT", maxAmount: bigint): Promise<BillResult> {
  const coin = tokenBySymbol(symbol)!;
  const payload = body(bill, symbol);
  const first = await post(payload);
  if (first.status !== 402) throw new Error(`AbaPay answered ${first.status} where a price was expected.`);
  const required = http.getPaymentRequiredResponse((h) => first.headers.get(h), await first.json().catch(() => undefined));
  const quote = checkChallenge(required.accepts as never, coin.address);
  if (quote.amount > maxAmount) {
    throw new Error(`The bill now costs ${quote.amount} and the drive raised ${maxAmount}; nothing was paid.`);
  }
  const signed = await http.createPaymentPayload(required);
  const paid = await post(payload, http.encodePaymentSignatureHeader(signed));
  const result = (await paid.json().catch(() => ({}))) as {
    success?: boolean;
    status?: string;
    purchased_code?: string | null;
    units?: string | null;
    tx_hash?: string;
    request_id?: string;
    error?: string;
  };
  return {
    ok: paid.ok && !!result.success && result.status === "SUCCESS",
    status: result.status ?? result.error ?? `HTTP ${paid.status}`,
    purchasedCode: result.purchased_code ?? null,
    units: result.units ?? null,
    settleTx: result.tx_hash ?? null,
    requestId: result.request_id ?? null,
    quote,
  };
}
