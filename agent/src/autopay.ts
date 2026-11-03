import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { concat, formatUnits, keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PROVIDERS } from "./abapay.js";
import { checkBillInput, priceBill, billRow } from "./billService.js";
import { account, createDriveOnchain, ERC20_ABI, publicClient } from "./chain.js";
import { env, tokenBySymbol } from "./config.js";
import { getBill, getDrive, getMeta, insertBill, insertDrive, setMeta } from "./db.js";
import { driveCode } from "./driveCode.js";

/**
 * Auto top-up: a standing order that repeats one bill drive once a day until a set date, paid the
 * way a member's own agent pays a share: an x402 payment in USA₮ from a wallet of its own, into a
 * USA₮ bill drive, after which Earmark pays AbaPay in USA₮ over x402 as it does for any bill.
 *
 * The payer wallet is derived from the agent's key, so it needs no secret of its own; it is a
 * separate address that holds only what was put there for top-ups. It is not the person's
 * custody wallet and is shown as what it is.
 *
 * Off unless AUTOPAY_FROM_DRIVE and AUTOPAY_UNTIL are set. Every run is capped, recorded before
 * anything is paid so a restart cannot pay twice, and stoppable from the chat.
 */

const TICK_MS = 10 * 60 * 1000;
const STOP_KEY = "autopay:stopped";

const cfg = () => ({
  fromDrive: Number(process.env.AUTOPAY_FROM_DRIVE ?? 0),
  until: process.env.AUTOPAY_UNTIL ?? "",
  hourUtc: Number(process.env.AUTOPAY_HOUR_UTC ?? 9),
  /** The most one run may cost, in USA₮. */
  maxUsd: Number(process.env.AUTOPAY_MAX_USD ?? 0.3),
});

/** The payer's key: the agent key hashed with a fixed label. Same on every machine that has the agent key. */
export function payerKey(agentKey: Hex): Hex {
  return keccak256(concat([agentKey, toHex("earmark/autopay/v1")]));
}
export const payer = privateKeyToAccount(payerKey(env.AGENT_PRIVATE_KEY));

/** The UTC day a run belongs to, or null when none is due. Exported for tests. */
export function dueDay(now: Date, until: string, hourUtc: number, lastDay: string | undefined): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) return null;
  const day = now.toISOString().slice(0, 10);
  if (day > until) return null;
  if (now.getUTCHours() < hourUtc) return null;
  if (lastDay && lastDay >= day) return null;
  return day;
}

type Note = (chatId: string, html: string, withStop: boolean) => Promise<void>;
let note: Note = async () => {};
/** The bot registers how to post into the chat; kept as a callback so this file does not import the bot. */
export function onAutopayNote(fn: Note) {
  note = fn;
}

export async function stopAutopay() {
  await setMeta(STOP_KEY, new Date().toISOString());
}

/** Only whoever opened the bill being repeated can stop it. */
export async function canStopAutopay(tgId: string): Promise<boolean> {
  const src = await getDrive(cfg().fromDrive);
  return !!src && (!src.collector_tg || src.collector_tg === tgId);
}

const usat = tokenBySymbol("USAT")!;

/** Pays `url` over x402 from the payer wallet, in USA₮ only and never more than `max`. */
async function payOverX402(url: string, max: bigint): Promise<{ status: number; tx: string | null; body: unknown }> {
  const policy = (_v: number, accepts: { asset?: string; amount?: string; maxAmountRequired?: string }[]) =>
    accepts.filter((r) => {
      const price = BigInt(r.maxAmountRequired ?? r.amount ?? "0");
      return r.asset?.toLowerCase() === usat.address.toLowerCase() && price > 0n && price <= max;
    });
  const h = new x402HTTPClient(
    registerExactEvmScheme(new x402Client().setSpendControls(false), { signer: payer, policies: [policy as never] }),
  );
  const first = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (first.status !== 402) throw new Error(`Expected a 402 from the drive, got ${first.status}: ${await first.text()}`);
  const required = h.getPaymentRequiredResponse((n) => first.headers.get(n), await first.json().catch(() => undefined));
  const signed = await h.createPaymentPayload(required);
  const paid = await fetch(url, { headers: h.encodePaymentSignatureHeader(signed), signal: AbortSignal.timeout(90_000) });
  let tx: string | null = null;
  try {
    tx = h.getPaymentSettleResponse((n) => paid.headers.get(n)).transaction || null;
  } catch {
    // no settlement header: refused before settling
  }
  return { status: paid.status, tx, body: await paid.json().catch(() => null) };
}

/** One run: open today's bill drive and pay it. Returns what happened, for the log and the chat. */
export async function runAutopay(day: string): Promise<string> {
  const c = cfg();
  const src = await getDrive(c.fromDrive);
  const srcBill = await getBill(c.fromDrive);
  if (!src || !srcBill || srcBill.intl) throw new Error(`Drive ${c.fromDrive} is not a Nigerian bill drive to repeat.`);
  if (srcBill.token !== "USAT") throw new Error(`Drive ${c.fromDrive} collects ${srcBill.token}; auto top-up pays USA₮ only.`);
  const key = Object.entries(PROVIDERS).find(([, p]) => p.serviceID === srcBill.service_id)?.[0];
  const input = checkBillInput(key ?? "", srcBill.billers_code, srcBill.naira_amount);
  if (!input.ok) throw new Error(input.error);

  const q = await priceBill(input.provider, input.number, srcBill.naira_amount, "USAT");
  const cap = BigInt(Math.round(c.maxUsd * 10 ** usat.decimals));
  if (q.target > cap) throw new Error(`Today's price, ${formatUnits(q.target, usat.decimals)} USA₮, is over the ${c.maxUsd} USA₮ cap.`);
  const held = (await publicClient.readContract({
    address: usat.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [payer.address],
  })) as bigint;
  if (held < q.target) {
    throw new Error(`The auto-pay wallet ${payer.address} has ${formatUnits(held, usat.decimals)} USA₮ and today needs ${formatUnits(q.target, usat.decimals)}.`);
  }

  // Recorded before anything is spent: a crash after this line skips the day rather than paying twice.
  await setMeta("autopay:last", day);

  const label = q.label;
  const { id, hash } = await createDriveOnchain({ token: usat.address, destination: account.address, target: q.target, deadline: 0n, label });
  const driveId = Number(id);
  await insertDrive({
    id: driveId,
    chat_id: src.chat_id,
    label,
    token: usat.address,
    destination: account.address,
    target: q.target.toString(),
    deadline: 0,
    collector_tg: src.collector_tg,
    collector_name: src.collector_name,
    created_tx: hash,
  });
  await insertBill(billRow(driveId, q.bill, q.quoted, "USAT"));

  const amt = formatUnits(q.target, usat.decimals);
  const params = new URLSearchParams({ amt, name: "auto top-up" });
  if (src.collector_tg) params.set("u", src.collector_tg);
  const url = `${env.PUBLIC_URL}/x402/drive/${driveCode(driveId)}?${params}`;
  const r = await payOverX402(url, q.target);
  if (r.status !== 200) throw new Error(`Drive ${driveCode(driveId)} is open but the x402 payment was refused (${r.status}).`);

  const settle = r.tx ? `\n<a href="https://celoscan.io/tx/${r.tx}">x402 settlement</a>` : "";
  await note(
    src.chat_id,
    `🔁 <b>Auto top-up</b>, ${day}: opened drive <code>${driveCode(driveId)}</code> for ${input.provider.label} ₦${srcBill.naira_amount.toLocaleString("en-US")} and paid it over x402 in USA₮ (${amt}) from the auto-pay wallet. Earmark now pays AbaPay; the receipt follows here.${settle}`,
    true,
  );
  return `drive ${driveId} paid, settlement ${r.tx ?? "pending"}`;
}

export function startAutopay() {
  const c = cfg();
  if (!c.fromDrive || !c.until) return;
  console.log(`auto top-up: repeats drive ${c.fromDrive} daily until ${c.until}, payer ${payer.address}`);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (await getMeta(STOP_KEY)) return;
      const day = dueDay(new Date(), c.until, c.hourUtc, await getMeta("autopay:last"));
      if (!day) return;
      console.log("auto top-up:", await runAutopay(day));
    } catch (e) {
      const msg = (e as Error).message;
      console.error("auto top-up:", msg);
      const src = await getDrive(c.fromDrive).catch(() => undefined);
      // Said once a day at most: a failure marks the day done too, unless nothing was attempted.
      if (src && (await getMeta("autopay:warned")) !== new Date().toISOString().slice(0, 10)) {
        await setMeta("autopay:warned", new Date().toISOString().slice(0, 10));
        await note(src.chat_id, `🔁 Auto top-up did not run today: ${msg}`, true).catch(() => {});
      }
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(tick, TICK_MS);
}

export const AUTOPAY_PAYER: Address = payer.address;
