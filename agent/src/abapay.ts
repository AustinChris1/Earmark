import { getAddress, parseAbi, type Address, type Hex } from "viem";
import { createSiweMessage } from "viem/siwe";
import { account, publicClient } from "./chain.js";
import { CELO_CHAIN_ID, tokenBySymbol } from "./config.js";
import { TOP_UP } from "./abapayIntl.js";

/**
 * AbaPay pays Nigerian bills (airtime, electricity, cable) for whoever settles its x402 challenge.
 * No account, API key or PIN on this path: the agent's wallet signs one EIP-3009 authorisation and
 * AbaPay vends the bill. https://agents.abapays.com/skill.md
 *
 * One trap, verified live: the token must be the exact string "USA₮" or "USD₮". Anything else,
 * plain "USAT" included, silently settles in USDC. So the asset AbaPay names is checked against the
 * coin the drive collected before anything is signed.
 *
 * A second trap: AbaPay's 402 body is x402 version 1, and Celo's facilitator only settles the
 * flat envelope {version 1, scheme exact, network "celo"} sent in the X-PAYMENT header. The
 * version 2 header on the same response, and the @x402 client that signs it, come back
 * "Unsupported scheme". The signature itself is still EIP-3009 over chain id 42220.
 *
 * A third: validAfter has to sit a day behind the clock. AbaPay's own site does this because a
 * window of a few minutes is rejected as "unable to estimate gas" when the chain clock is behind
 * the machine that signed. The authorization still expires at validBefore, and the nonce is
 * single use.
 */

const ENDPOINT = process.env.ABAPAY_X402 ?? "https://agents.abapays.com/api/pay/x402";
const ABAPAY_ORIGIN = new URL(ENDPOINT).origin;

export type BillCategory = "AIRTIME" | "ELECTRICITY" | "CABLE" | "INTERNATIONAL";

/** A top-up abroad: the plan's code fixes the price, the rest says where it goes. */
export type IntlBill = {
  countryCode: string;
  operatorId: string;
  operatorName: string;
  variationCode: string;
  /** The plan's face value in the local currency, e.g. "2000.00" with currency "ARS". */
  foreignAmount: string;
  currency: string;
};

export type Bill = {
  category: BillCategory;
  /** AbaPay / VTpass service id, e.g. "ikeja-electric", "mtn". */
  serviceID: string;
  /** Provider name, e.g. "IKEJA-ELECTRIC", "MTN". */
  network: string;
  /** Meter, phone or smartcard number. */
  billersCode: string;
  /** What VTpass charges in naira; for a top-up abroad, the plan's naira equivalent. */
  nairaAmount: number;
  intl?: IntlBill;
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

export function body(bill: Bill, symbol: string) {
  const token = ABAPAY_TOKEN[symbol];
  if (!token) throw new Error(`AbaPay settles in USA₮, USD₮ or USDC, not ${symbol}.`);
  if (bill.intl) {
    const i = bill.intl;
    return {
      serviceID: "foreign-airtime",
      serviceCategory: "INTERNATIONAL",
      network: i.operatorName.toUpperCase(),
      billersCode: bill.billersCode,
      phone: bill.billersCode,
      operator_id: i.operatorId,
      country_code: i.countryCode,
      product_type_id: TOP_UP,
      variation_code: i.variationCode,
      nairaAmount: bill.nairaAmount,
      foreignAmount: i.foreignAmount,
      displayAmount: `${i.currency} ${i.foreignAmount}`,
      token,
      blockchain: "CELO",
      wallet_address: account.address,
    };
  }
  return {
    serviceID: bill.serviceID,
    serviceCategory: bill.category,
    network: bill.network,
    billersCode: bill.billersCode,
    // Airtime is delivered to this number. AbaPay stores phone separately from the account.
    ...(bill.category === "AIRTIME" ? { phone: bill.billersCode } : {}),
    nairaAmount: bill.nairaAmount,
    token,
    blockchain: "CELO",
    wallet_address: account.address,
  };
}

type Accept = {
  scheme?: string;
  network?: string;
  asset?: string;
  amount?: string;
  maxAmountRequired?: string;
  payTo?: string;
  maxTimeoutSeconds?: number;
  extra?: { name?: string; version?: string };
};

const AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

async function post(payload: object, headers: Record<string, string> = {}) {
  return fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90_000),
  });
}

/** The price is in the JSON body. The Payment-Required header on the same response is version 2, which AbaPay will not settle. */
export function acceptsFrom(body: unknown): Accept[] {
  const listed = (body as { accepts?: Accept[] } | null)?.accepts;
  return Array.isArray(listed) ? listed : [];
}

function pickAccept(accepts: Accept[]): Accept | undefined {
  const usable = (x: Accept) => x.scheme === undefined || x.scheme === "exact";
  return accepts.find((x) => usable(x) && (x.network === "eip155:42220" || x.network === "celo")) ?? accepts.find(usable) ?? accepts[0];
}

/** Reads the 402 challenge and refuses it unless it asks for the coin the drive actually holds. */
export function checkChallenge(accepts: Accept[], expected: Address): BillQuote {
  const a = pickAccept(accepts);
  if (!a?.asset || !a.payTo) throw new Error("AbaPay did not name a price.");
  if (a.asset.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`AbaPay asked for ${a.asset}, not the ${expected} this drive collected; nothing was signed.`);
  }
  const amount = BigInt(a.maxAmountRequired ?? a.amount ?? "0");
  if (amount <= 0n) throw new Error("AbaPay quoted a zero price.");
  return { asset: getAddress(a.asset), amount, payTo: getAddress(a.payTo) };
}

/** How long the signed authorization is valid. Matches the window AbaPay's own checkout signs. */
export function authorizationWindow(now: number, maxTimeoutSeconds?: number): { validAfter: number; validBefore: number } {
  const timeout = maxTimeoutSeconds && maxTimeoutSeconds > 0 ? maxTimeoutSeconds : 3600;
  return {
    validAfter: now - 86_400,
    validBefore: now + Math.max(900, Math.min(timeout, 86_400)),
  };
}

/**
 * The flat version-1 envelope Celo's facilitator settles. network is the name "celo", not the
 * CAIP id used in the challenge: the facilitator rejects the other combination.
 */
export function v1PaymentHeader(
  authorization: { from: Address; to: Address; value: string; validAfter: string; validBefore: string; nonce: Hex },
  signature: Hex,
): string {
  return Buffer.from(JSON.stringify({
    x402Version: 1,
    scheme: "exact",
    network: "celo",
    payload: { signature, authorization },
  })).toString("base64");
}

function randomNonce(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const AUTH_STATE = parseAbi(["function authorizationState(address authorizer, bytes32 nonce) view returns (bool)"]);

/** True when this authorization already moved money. Null when the chain could not be read. */
async function authorizationUsed(token: Address, nonce: Hex): Promise<boolean | null> {
  try {
    return await publicClient.readContract({
      address: token,
      abi: AUTH_STATE,
      functionName: "authorizationState",
      args: [account.address, nonce],
    });
  } catch {
    return null;
  }
}

/** The live price of a bill in `symbol`, from AbaPay's 402 body. Nothing is paid. */
export async function quoteBill(bill: Bill, symbol: "USAT" | "USDT"): Promise<BillQuote> {
  const coin = tokenBySymbol(symbol)!;
  const r = await post(body(bill, symbol));
  if (r.status !== 402) throw new Error(`AbaPay answered ${r.status} where a price was expected.`);
  return checkChallenge(acceptsFrom(await r.json().catch(() => undefined)), coin.address);
}

export type BillResult = {
  ok: boolean;
  status: string;
  purchasedCode: string | null;
  units: string | null;
  settleTx: string | null;
  requestId: string | null;
  quote: BillQuote;
  /** The EIP-3009 authorisation the agent signed: used on chain means AbaPay took the money. */
  authorization: { nonce: Hex; validBefore: number; fromBlock?: number } | null;
};

export type AbaRecord = {
  status: string;
  tx: string | null;
  requestId: string | null;
  purchasedCode: string | null;
  units: string | null;
};

/** What to do with an AbaPay row once the stablecoin has already moved. */
export function vendPhase(status: string): "paid" | "failed" | "pending" {
  const s = status.toUpperCase();
  if (s === "SUCCESS") return "paid";
  if (s === "FAILED_VENDING" || s === "REFUNDED" || s === "REVERSED_NEEDS_REFUND") return "failed";
  return "pending";
}

/** The history row for this settlement. Matching is by transaction hash, never by a new payment. */
export function recordFromHistory(rows: unknown, txHash: string): AbaRecord | null {
  if (!Array.isArray(rows)) return null;
  const want = txHash.toLowerCase();
  const found = (rows as Array<Record<string, unknown>>).find((row) => {
    const tx = String(row.tx_hash ?? "").toLowerCase();
    const settle = String(row.x402_settle_tx ?? "").toLowerCase();
    return tx === want || settle === want;
  });
  if (!found || typeof found.status !== "string") return null;
  const tx = typeof found.tx_hash === "string" ? found.tx_hash : typeof found.x402_settle_tx === "string" ? found.x402_settle_tx : null;
  return {
    status: found.status,
    tx,
    requestId: typeof found.request_id === "string" ? found.request_id : null,
    purchasedCode: typeof found.purchased_code === "string" ? found.purchased_code : null,
    units: found.units == null ? null : String(found.units),
  };
}

/**
 * Pays the bill from the agent wallet. `maxAmount` is what the drive raised; if AbaPay's price has
 * moved above it, nothing is signed.
 */
export async function payBill(bill: Bill, symbol: "USAT" | "USDT", maxAmount: bigint): Promise<BillResult> {
  const coin = tokenBySymbol(symbol)!;
  const payload = body(bill, symbol);
  const first = await post(payload);
  if (first.status !== 402) throw new Error(`AbaPay answered ${first.status} where a price was expected.`);
  const accepts = acceptsFrom(await first.json().catch(() => undefined));
  const quote = checkChallenge(accepts, coin.address);
  if (quote.amount > maxAmount) {
    throw new Error(`The bill now costs ${quote.amount} and the drive raised ${maxAmount}; nothing was paid.`);
  }
  const accept = pickAccept(accepts)!;
  let last: BillResult | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const now = Math.floor(Date.now() / 1000);
    const window = authorizationWindow(now, accept.maxTimeoutSeconds);
    const nonce = randomNonce();
    const authorization = {
      from: account.address,
      to: quote.payTo,
      value: quote.amount.toString(),
      validAfter: String(window.validAfter),
      validBefore: String(window.validBefore),
      nonce,
    };
    const signature = await account.signTypedData({
      domain: {
        name: accept.extra?.name || coin.eip712!.name,
        version: accept.extra?.version || coin.eip712!.version,
        chainId: CELO_CHAIN_ID,
        verifyingContract: quote.asset,
      },
      types: AUTH_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: account.address,
        to: quote.payTo,
        value: quote.amount,
        validAfter: BigInt(window.validAfter),
        validBefore: BigInt(window.validBefore),
        nonce,
      },
    });
    const signed = { nonce, validBefore: window.validBefore };
    let paid: Response;
    try {
      paid = await post(payload, { "X-PAYMENT": v1PaymentHeader(authorization, signature) });
    } catch (e) {
      const moved = await authorizationUsed(quote.asset, nonce);
      last = {
        ok: false,
        status: `no answer from AbaPay: ${(e as Error).message}`,
        purchasedCode: null,
        units: null,
        settleTx: null,
        requestId: null,
        quote,
        authorization: signed,
      };
      if (attempt === 0 && moved === false) continue;
      return last;
    }
    const result = (await paid.json().catch(() => ({}))) as {
      success?: boolean;
      status?: string;
      purchased_code?: string | null;
      units?: string | null;
      tx_hash?: string;
      request_id?: string;
      error?: string;
      message?: string;
      retryable?: boolean;
      settled?: boolean;
    };
    last = {
      ok: paid.ok && !!result.success && result.status === "SUCCESS",
      status: result.status ?? result.error ?? result.message ?? `HTTP ${paid.status}`,
      purchasedCode: result.purchased_code ?? null,
      units: result.units ?? null,
      settleTx: result.tx_hash ?? null,
      requestId: result.request_id ?? null,
      quote,
      authorization: signed,
    };
    if (last.ok) return last;
    const used = await authorizationUsed(quote.asset, nonce);
    const spent = result.settled === true || !!result.tx_hash || used === true;
    if (attempt === 0 && result.retryable && !spent) continue;
    if (spent && vendPhase(last.status) === "pending") {
      last.status = "PROCESSING";
      const followed = await lookupSettledBill(last.settleTx).catch(() => null);
      if (followed) applyFollowup(last, followed);
    }
    return last;
  }
  return last!;
}

function applyFollowup(result: BillResult, followed: AbaRecord) {
  result.requestId = followed.requestId ?? result.requestId;
  result.purchasedCode = followed.purchasedCode ?? result.purchasedCode;
  result.units = followed.units ?? result.units;
  if (!result.settleTx && followed.tx) result.settleTx = followed.tx;
  const phase = vendPhase(followed.status);
  if (phase === "paid") {
    result.ok = true;
    result.status = "SUCCESS";
  } else if (phase === "failed") {
    result.status = followed.status;
  }
}

/**
 * Reads the agent's own AbaPay history for one settlement.
 * A spent USA₮ or USD₮ nonce reverts as "auth invalid", so sending the same payment again is
 * reported as a bad signature and does not reveal whether the airtime went out. History does.
 */
export async function lookupSettledBill(txHash: string | null): Promise<AbaRecord | null> {
  if (!txHash) return null;
  const headers = await sessionHeaders();
  const res = await fetch(`${ABAPAY_ORIGIN}/api/history`, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { transactions?: unknown } | null;
  return recordFromHistory(body?.transactions, txHash);
}

async function sessionHeaders(): Promise<Record<string, string>> {
  const origin = ABAPAY_ORIGIN;
  const nonceRes = await fetch(`${origin}/api/auth/nonce?purpose=session`, { signal: AbortSignal.timeout(20_000) });
  const nonceBody = (await nonceRes.json().catch(() => null)) as { nonce?: string } | null;
  if (!nonceRes.ok || !nonceBody?.nonce) throw new Error("AbaPay did not start a session.");
  const message = createSiweMessage({
    domain: new URL(origin).host,
    uri: origin,
    address: account.address,
    chainId: CELO_CHAIN_ID,
    nonce: nonceBody.nonce,
    version: "1",
    issuedAt: new Date(),
    expirationTime: new Date(Date.now() + 12 * 60 * 60 * 1000),
    statement:
      "Sign in to AbaPay. This proves you control this wallet and starts a read-only session. It does NOT approve any payment, transfer, or spending permission.",
    resources: ["abapay:session"],
  });
  const signature = await account.signMessage({ message });
  return {
    "x-wallet-address": account.address,
    "x-wallet-signature": signature,
    "x-wallet-siwe": Buffer.from(message, "utf8").toString("base64"),
  };
}
