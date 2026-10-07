import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { decodeEventLog, formatUnits, getAddress, isHex, parseAbi, parseUnits, type Address, type Hex } from "viem";
import { tokenByAddress, tokenBySymbol } from "./config.js";
import { account, contributeFromAgent, publicClient, readDrive, refundFromAgent } from "./chain.js";
import { cancel, execute, preview, requestFirm, type FirmQuote } from "./textile.js";
import { isCorridorLocal, payToken, settle, withHeadroom, type CorridorDeps, type CorridorIntent, type IntentStatus } from "./corridor.js";
import { addCorridorIntent, getCorridorIntent, setCorridorStatus, unsettledCorridorIntents, type CorridorRow } from "./db.js";

const USDT = tokenBySymbol("USDT")!;
const USAT = tokenBySymbol("USAT")!;
const TRANSFER = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

const deps: CorridorDeps<FirmQuote> = {
  usdt: USDT.address,
  usat: USAT.address,
  readDrive: async (id) => {
    const d = await readDrive(BigInt(id));
    return { token: d.token, target: d.target, raised: d.raised, closed: d.closed };
  },
  firmExactIn: (sell, buy, sellAmount) => requestFirm(sell, buy, { sellAmount }),
  firmExactOut: (sell, buy, buyAmount) => requestFirm(sell, buy, { buyAmount }),
  execute,
  cancel,
  contribute: (driveId, token, amount, memo) => contributeFromAgent(BigInt(driveId), token, amount, memo, { celoGas: true }),
  refund: refundFromAgent,
  setStatus: (id, status, fields) => setCorridorStatus(id, status, fields),
};

/**
 * What a payer would send for a local amount, with the headroom included. The unused part comes back
 * after the swap, so this is the most they spend, not the price.
 */
export async function corridorQuote(local: Address, wantLocal: bigint, pay: "USDT" | "USAT") {
  const toLocal = await preview(USDT.address, local, { buyAmount: wantLocal });
  let usdtNeeded = toLocal.takerPays;
  let payAmount = usdtNeeded;
  if (pay === "USAT") {
    // USA₮ has no direct corridor; price the hop into the USDT the second swap needs.
    const hop = await preview(USAT.address, USDT.address, { buyAmount: usdtNeeded });
    payAmount = hop.takerPays;
  }
  return { usdtNeeded, payAmount, maxPay: withHeadroom(payAmount) };
}

const ALLOWED_PAY = new Set([USDT.address.toLowerCase(), USAT.address.toLowerCase()]);

/** Reads what a payment transaction actually sent to the agent; trusts nothing the client says about amounts. */
async function receivedIn(txHash: Hex) {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error("That payment transaction failed on chain.");
  let token: Address | undefined;
  let payer: Address | undefined;
  let amount = 0n;
  for (const log of receipt.logs) {
    if (!ALLOWED_PAY.has(log.address.toLowerCase())) continue;
    try {
      const ev = decodeEventLog({ abi: TRANSFER, data: log.data, topics: log.topics });
      if (ev.args.to.toLowerCase() !== account.address.toLowerCase()) continue;
      if (token && token.toLowerCase() !== log.address.toLowerCase()) throw new Error("A payment must be in one coin.");
      token = getAddress(log.address);
      payer = getAddress(ev.args.from);
      amount += ev.args.value;
    } catch (e) {
      if ((e as Error).message.startsWith("A payment")) throw e;
    }
  }
  if (!token || !payer || amount === 0n) throw new Error("That transaction did not send USDT or USA₮ to Earmark.");
  return { token, payer, amount };
}

async function run(row: CorridorRow) {
  const intent: CorridorIntent = {
    id: row.id,
    drive_id: row.drive_id,
    payer: row.payer as Address,
    pay_token: row.pay_token as Address,
    pay_amount: BigInt(row.pay_amount),
    pay_tx: row.pay_tx as Hex,
    want_local: BigInt(row.want_local),
    memo: row.memo,
    status: row.status as IntentStatus,
  };
  try {
    const r = await settle(intent, deps);
    console.log(`corridor ${row.id}: ${r.status}`);
  } catch (e) {
    console.error(`corridor ${row.id}: ${(e as Error).message}`);
  }
}

// One at a time: concurrent swaps would read each other's balances in the agent wallet.
let queue: Promise<void> = Promise.resolve();
function enqueue(row: CorridorRow) {
  queue = queue.then(() => run(row));
}

/** Picks up anything that arrived but did not finish, e.g. across a restart. */
export async function resumeCorridor() {
  for (const row of await unsettledCorridorIntents()) enqueue(row);
}

// --- HTTP ---------------------------------------------------------------------------------------

export const corridorQuoteHandler: RequestHandler = async (req, res) => {
  try {
    const driveId = String(req.params.id);
    if (!/^\d+$/.test(driveId)) return res.status(400).json({ error: "Bad drive." });
    const drive = await readDrive(BigInt(driveId));
    const local = tokenByAddress(drive.token);
    if (!isCorridorLocal(local)) return res.status(400).json({ error: "This drive is not in a coin Earmark can convert into." });
    const pay = payToken(String(req.query.pay ?? "USDT"));
    if (!pay) return res.status(400).json({ error: "Pay in USDT or USA₮." });
    const raw = String(req.query.amount ?? "");
    const wantLocal = parseUnits(raw, local!.decimals);
    if (wantLocal <= 0n) return res.status(400).json({ error: "Enter an amount." });
    const q = await corridorQuote(drive.token, wantLocal, pay.symbol as "USDT" | "USAT");
    res.json({
      driveId: Number(driveId),
      local: local!.symbol,
      wantLocal: wantLocal.toString(),
      pay: pay.symbol,
      payToken: pay.address,
      payDecimals: pay.decimals,
      quote: formatUnits(q.payAmount, pay.decimals),
      maxPay: q.maxPay.toString(),
      maxPayHuman: formatUnits(q.maxPay, pay.decimals),
      sendTo: account.address,
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const corridorSubmitHandler: RequestHandler = async (req, res) => {
  try {
    const { driveId, payTx, wantLocal, name, u } = (req.body ?? {}) as Record<string, string>;
    if (!isHex(payTx) || payTx.length !== 66) return res.status(400).json({ error: "Send the payment transaction hash." });
    const id = Number(driveId);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Bad drive." });
    const want = BigInt(wantLocal);
    const got = await receivedIn(payTx);
    const tg = typeof u === "string" && /^\d{1,20}$/.test(u) ? u : "";
    const who = typeof name === "string" ? name.slice(0, 40) : "";
    const row = {
      id: randomUUID(),
      drive_id: id,
      payer: got.payer,
      pay_token: got.token,
      pay_amount: got.amount.toString(),
      pay_tx: payTx,
      want_local: want.toString(),
      memo: tg ? `tg:${tg}:${who}` : who,
    };
    if (!(await addCorridorIntent(row))) return res.status(409).json({ error: "That payment was already received." });
    const saved = (await getCorridorIntent(row.id))!;
    enqueue(saved);
    res.json({ id: row.id, status: saved.status });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const corridorStatusHandler: RequestHandler = async (req, res) => {
  const row = await getCorridorIntent(String(req.params.id));
  if (!row) return res.status(404).json({ error: "Not found." });
  res.json(row);
};
