import { getAddress, parseAbi, verifyMessage, type Address, type Hex } from "viem";
import { env, tokenBySymbol } from "./config.js";
import { account, publicClient, readDrive, refundFromAgent } from "./chain.js";
import { payBill, PROVIDERS, quoteBill, type Bill, type BillResult, type IntlBill } from "./abapay.js";
import { intlCountry, intlNumber, intlOperators, intlPlans, type IntlPlan } from "./abapayIntl.js";
import { billTarget, maskNumber, returnShares, settleBill, type BillOutcome, type Share } from "./bills.js";
import { billsWithStatus, getBill, insertBill, paymentsFor, realPayerFor, setBillStatus, type BillRow } from "./db.js";

/** The coins a bill drive can collect. USD₮ is the one other currencies can be swapped into. */
export type BillCoin = "USAT" | "USDT";
export const BILL_COINS: readonly BillCoin[] = ["USAT", "USDT"];

type Provider = (typeof PROVIDERS)[string];

export function billOf(row: BillRow): Bill {
  return {
    category: row.category as Bill["category"],
    serviceID: row.service_id,
    network: row.network,
    billersCode: row.billers_code,
    nairaAmount: row.naira_amount,
    ...(row.intl ? { intl: JSON.parse(row.intl) as IntlBill } : {}),
  };
}

export function providerLabel(row: Pick<BillRow, "service_id" | "category" | "intl">): string {
  if (row.intl) return `${(JSON.parse(row.intl) as IntlBill).operatorName} airtime`;
  return Object.values(PROVIDERS).find((p) => p.serviceID === row.service_id)?.label ?? row.service_id;
}

/** "2,000 ARS" for a plan abroad. */
export function foreignAmount(p: Pick<IntlPlan, "amount" | "currency">): string {
  return `${Number(p.amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${p.currency}`;
}

/** What the bill is worth, in the money it is paid in: "₦15,000", or "2,000 ARS" abroad. */
export function billAmount(row: Pick<BillRow, "naira_amount" | "intl">): string {
  if (row.intl) {
    const i = JSON.parse(row.intl) as IntlBill;
    return foreignAmount({ amount: i.foreignAmount, currency: i.currency });
  }
  return `₦${row.naira_amount.toLocaleString("en-US")}`;
}

/** Checks what someone entered for a bill, the same way for the bot and the website. */
export function checkBillInput(
  providerKey: string,
  numberRaw: string,
  naira: number,
): { ok: true; provider: Provider; number: string } | { ok: false; error: string } {
  const provider = PROVIDERS[providerKey.toLowerCase()];
  if (!provider) return { ok: false, error: "Pick a provider." };
  const number = numberRaw.replace(/[\s-]/g, "");
  const what = provider.category === "ELECTRICITY" ? "meter number" : "phone number";
  if (!/^\d{6,15}$/.test(number)) return { ok: false, error: `That ${what} should be digits only, 6 to 15 of them.` };
  if (!Number.isInteger(naira) || naira < 100) return { ok: false, error: "The amount must be a whole number of naira, ₦100 or more." };
  if (naira > 1_000_000) return { ok: false, error: "That is more than one bill drive should carry. Split it into smaller drives." };
  return { ok: true, provider, number };
}

/** The on-chain label is public, so the number is masked there. */
export function billLabel(p: Provider, number: string, naira: number): string {
  return `${p.label} ${maskNumber(number)} N${naira.toLocaleString("en-US")}`.slice(0, 80);
}

/** AbaPay's live price, and the drive target with headroom on top. Nothing is paid. */
export async function priceBill(p: Provider, number: string, naira: number, coin: BillCoin) {
  const bill: Bill = { category: p.category, serviceID: p.serviceID, network: p.network, billersCode: number, nairaAmount: naira };
  const quoted = (await quoteBill(bill, coin)).amount;
  return { bill, quoted, target: billTarget(quoted), label: billLabel(p, number, naira) };
}

/**
 * A top-up abroad, checked against AbaPay's live catalogue: the country, operator and plan must all
 * still be offered, and the number must belong to that country. The price comes from the plan.
 */
export async function intlBillFor(countryCode: string, operatorId: string, planCode: string, numberRaw: string) {
  const country = await intlCountry(countryCode);
  if (!country) throw new Error("Pick a country.");
  const operator = (await intlOperators(country.code)).find((o) => o.id === operatorId);
  if (!operator) throw new Error(`Pick a network in ${country.name}.`);
  const plan = (await intlPlans(operator.id)).find((p) => p.code === planCode);
  if (!plan) throw new Error("That top-up is no longer offered. Pick another.");
  const number = intlNumber(country.prefix, numberRaw);
  if (!number) throw new Error(`That does not look like a phone number in ${country.name} (+${country.prefix}…).`);
  const bill: Bill = {
    category: "INTERNATIONAL",
    serviceID: "foreign-airtime",
    network: operator.name.toUpperCase(),
    billersCode: number,
    nairaAmount: plan.naira,
    intl: {
      countryCode: country.code,
      operatorId: operator.id,
      operatorName: operator.name,
      variationCode: plan.code,
      foreignAmount: plan.amount,
      currency: plan.currency,
    },
  };
  const label = `${operator.name} ${maskNumber(number)} ${foreignAmount(plan)}`.slice(0, 80);
  return { bill, country, operator, plan, number, label };
}

/** AbaPay's live price for a top-up abroad, and the drive target. Nothing is paid. */
export async function priceIntlBill(countryCode: string, operatorId: string, planCode: string, numberRaw: string, coin: BillCoin) {
  const r = await intlBillFor(countryCode, operatorId, planCode, numberRaw);
  const quoted = (await quoteBill(r.bill, coin)).amount;
  return { ...r, quoted, target: billTarget(quoted) };
}

/** The bills-table row for a priced bill, Nigerian or abroad. */
export function billRow(driveId: number, bill: Bill, quoted: bigint, coin: BillCoin) {
  return {
    drive_id: driveId,
    category: bill.category,
    service_id: bill.serviceID,
    network: bill.network,
    billers_code: bill.billersCode,
    naira_amount: bill.nairaAmount,
    quoted: quoted.toString(),
    token: coin,
    intl: bill.intl ? JSON.stringify(bill.intl) : null,
  };
}

// --- Bill drives opened on the website ----------------------------------------------------------
// The website opens the drive from the person's own wallet, with Earmark as the locked payee. These
// signed messages make sure only that person can say which bill it pays, and see its receipt.

export function attachMessage(driveId: number, p: Provider, number: string, naira: number): string {
  return `Earmark: when drive #${driveId} is full, pay ${p.label} for ${number}, N${naira.toLocaleString("en-US")}.`;
}

export function attachIntlMessage(driveId: number, operatorName: string, number: string, plan: Pick<IntlPlan, "amount" | "currency">): string {
  return `Earmark: when drive #${driveId} is full, top up ${operatorName} +${number} with ${foreignAmount(plan)}.`;
}

export function receiptMessage(driveId: number): string {
  return `Earmark: show me the receipt for drive #${driveId}.`;
}

type AttachNigerian = { provider: string; naira: number };
type AttachAbroad = { country: string; operator: string; plan: string };

export async function attachBill(a: { driveId: number; number: string; coin: string; signature: Hex } & (AttachNigerian | AttachAbroad)) {
  const coin = BILL_COINS.find((c) => c === a.coin);
  if (!coin) throw new Error("A bill drive collects USA₮ or USD₮.");
  if (await getBill(a.driveId)) throw new Error("That drive already pays a bill.");
  const d = await readDrive(BigInt(a.driveId));
  if (d.destination.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error("That drive does not pay Earmark, so Earmark cannot pay a bill from it.");
  }
  if (d.token.toLowerCase() !== tokenBySymbol(coin)!.address.toLowerCase()) throw new Error(`That drive does not collect ${coin}.`);
  if (d.closed || d.raised > 0n) throw new Error("A bill can only be attached to a new, empty drive.");

  let bill: Bill;
  let message: string;
  if ("country" in a) {
    const r = await intlBillFor(a.country, a.operator, a.plan, a.number);
    bill = r.bill;
    message = attachIntlMessage(a.driveId, r.operator.name, r.number, r.plan);
  } else {
    const input = checkBillInput(a.provider, a.number, a.naira);
    if (!input.ok) throw new Error(input.error);
    bill = (await priceBill(input.provider, input.number, a.naira, coin)).bill;
    message = attachMessage(a.driveId, input.provider, input.number, a.naira);
  }
  const signed = await verifyMessage({ address: d.collector, message, signature: a.signature });
  if (!signed) throw new Error("Only the wallet that opened the drive can attach its bill.");
  const quoted = (await quoteBill(bill, coin)).amount;
  if (d.target < quoted) throw new Error("The bill now costs more than this drive collects. Open it again for the new price.");
  await insertBill(billRow(a.driveId, bill, quoted, coin));
}

/** The token or receipt, for the wallet that opened a website bill drive. */
export async function billReceipt(driveId: number, signature: Hex) {
  const row = await getBill(driveId);
  if (!row) throw new Error("That drive does not pay a bill.");
  const d = await readDrive(BigInt(driveId));
  const ok = await verifyMessage({ address: d.collector, message: receiptMessage(driveId), signature });
  if (!ok) throw new Error("Only the wallet that opened this drive can see its receipt.");
  return {
    number: row.billers_code,
    status: row.status,
    purchasedCode: row.purchased_code || null,
    units: row.units || null,
    settleTx: row.settle_tx || null,
  };
}

// --- Paying ------------------------------------------------------------------------------------

// The bot registers how to tell a group what happened; kept as a callback so this file does not import the bot.
type Notify = (driveId: number, row: BillRow, outcome: BillOutcome) => Promise<void>;
let notify: Notify = async () => {};
export function onBillSettled(fn: Notify) {
  notify = fn;
}

/**
 * Everyone who paid into a drive. A payment the agent made on someone's behalf (a swapped payment,
 * or an x402 one) is credited to the person who actually sent it, so their change can go back to them.
 */
async function realPayments(driveId: number): Promise<Share[]> {
  const out: Share[] = [];
  for (const p of await paymentsFor(driveId)) {
    let payer = getAddress(p.payer);
    if (payer === account.address) {
      const real = await realPayerFor(p.tx_hash);
      if (real) payer = getAddress(real);
    }
    out.push({ payer, amount: BigInt(p.amount) });
  }
  return out;
}

const AUTH_ABI = parseAbi(["function authorizationState(address authorizer, bytes32 nonce) view returns (bool)"]);
const TRANSFER = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const SCAN = 2000n;

/** Whether `amount` came back to the agent since `fromBlock` from someone other than a drive payer. */
async function refundSeen(token: Address, amount: bigint, fromBlock: bigint): Promise<boolean> {
  const head = await publicClient.getBlockNumber();
  for (let from = fromBlock; from <= head; from += SCAN) {
    const to = from + SCAN - 1n < head ? from + SCAN - 1n : head;
    const logs = await publicClient.getContractEvents({
      address: token,
      abi: TRANSFER,
      eventName: "Transfer",
      args: { to: account.address },
      fromBlock: from,
      toBlock: to,
    });
    for (const log of logs) {
      if (log.args.value !== amount) continue;
      // A share paid into another bill drive also lands here; it arrives through the Earmark contract.
      const tx = await publicClient.getTransaction({ hash: log.transactionHash });
      if (tx.to?.toLowerCase() === env.EARMARK_ADDRESS.toLowerCase()) continue;
      return true;
    }
  }
  return false;
}

type Auth = { nonce: Hex; validBefore: number; fromBlock?: number };

async function afterFailure(token: Address, auth: Auth | null, paid: bigint): Promise<"intact" | "returned" | "waiting"> {
  // Without the authorisation there is no way to tell whether money left, so a person checks it.
  if (!auth) return "waiting";
  const used = await publicClient.readContract({
    address: token,
    abi: AUTH_ABI,
    functionName: "authorizationState",
    args: [account.address, auth.nonce],
  });
  if (!used) return Date.now() / 1000 > auth.validBefore ? "intact" : "waiting";
  return (await refundSeen(token, paid, BigInt(auth.fromBlock ?? 0))) ? "returned" : "waiting";
}

// One bill at a time: two settling at once would read the same agent wallet.
let queue: Promise<void> = Promise.resolve();

/** Called after every payment into a drive; pays the bill once the drive is full. */
export function maybeSettleBill(driveId: number) {
  queue = queue.then(async () => {
    const row = await getBill(driveId);
    if (!row || row.status !== "collecting") return;
    const d = await readDrive(BigInt(driveId));
    if (d.target === 0n || d.raised < d.target) return;
    const coin = tokenBySymbol(row.token)!;
    try {
      const outcome = await settleBill(driveId, billOf(row), d.raised, await realPayments(driveId), {
        agent: account.address,
        token: coin.address,
        pay: async (bill, max) => {
          const fromBlock = Number(await publicClient.getBlockNumber());
          const r = await payBill(bill, row.token as BillCoin, max);
          return { ...r, authorization: r.authorization && { ...r.authorization, fromBlock } };
        },
        refund: (to, amount) => refundFromAgent(coin.address, to, amount),
        afterFailure: (r: BillResult) => afterFailure(coin.address, r.authorization, r.quote.amount),
        setStatus: (id, status, fields) => setBillStatus(id, status, fields),
      });
      console.log(`bill drive ${driveId}: ${outcome.status}`);
      await notify(driveId, (await getBill(driveId))!, outcome).catch((e) => console.error("bill notify:", e));
    } catch (e) {
      console.error(`bill drive ${driveId}:`, (e as Error).message);
      await setBillStatus(driveId, "failed", { note: (e as Error).message });
    }
  });
  return queue;
}

/** A bill AbaPay could not deliver: once its refund is here, everyone gets their share back. */
function retryRefund(row: BillRow) {
  queue = queue.then(async () => {
    const coin = tokenBySymbol(row.token)!;
    const auth = row.auth ? (JSON.parse(row.auth) as Auth) : null;
    const state = await afterFailure(coin.address, auth, BigInt(row.paid_amount ?? "0"));
    if (state === "waiting") return;
    const d = await readDrive(BigInt(row.drive_id));
    const refunds = await returnShares(await realPayments(row.drive_id), d.raised, {
      agent: account.address,
      refund: (to, amount) => refundFromAgent(coin.address, to, amount),
    });
    const reason = "AbaPay could not deliver the bill and refunded it.";
    await setBillStatus(row.drive_id, "refunded", { note: reason });
    await notify(row.drive_id, (await getBill(row.drive_id))!, { status: "refunded", reason, refunds }).catch(() => {});
  }).catch((e) => console.error(`bill refund ${row.drive_id}:`, (e as Error).message));
}

/** Picks up full drives whose last payment was missed, and finishes refunds AbaPay has returned. */
export function startBillSweeper() {
  const tick = async () => {
    try {
      for (const row of await billsWithStatus("collecting")) void maybeSettleBill(row.drive_id);
      for (const row of await billsWithStatus("awaiting_refund")) retryRefund(row);
    } catch (e) {
      console.error("bill sweeper:", (e as Error).message);
    }
  };
  void tick();
  return setInterval(tick, 120_000);
}
