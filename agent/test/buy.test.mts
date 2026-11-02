import "./setup-env.mts";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

// A cap of 0.015 USDC: room for one 0.01 call and not two.
process.env.BUY_DAILY_USD = "0.015";
process.env.BUY_TOKEN = "USDC";

const { affordable, buyFetch } = await import("../src/buy.js");
const { failedBuyCalls, migrate, paidBuyCalls, recentBuyCalls } = await import("../src/db.js");
const chain = await import("../src/chain.js");
const { account } = chain;
// The test wallet holds 1 USDC; nothing here reads the real chain.
(chain.publicClient as { readContract: unknown }).readContract = async () => 1_000_000n;
const { completionText } = await import("../src/ai.js");
const { memoFor } = await import("../src/x402.js");
const { env } = await import("../src/config.js");

const USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";
const PAY_TO = "0x20faAca5F980E29639A0FCC6dcA6988E18ed333B";
const TX = `0x${"ab".repeat(32)}`;

// A stand-in for buy's gateway: the same v1 challenge it returns live, then a check of what came back.
let price = "10000";
// When set, the gateway takes the signature and still answers 402, as it does once the wallet is empty.
let refusePaid = false;
const seen: { x402Version?: number; network?: string; payload?: { authorization?: { from: string; to: string; value: string } } }[] = [];
const accept = (asset: string, extra: object) => ({
  scheme: "exact",
  network: "celo",
  maxAmountRequired: price,
  resource: "http://test/cencori/v1/chat/completions",
  description: "Chat completion",
  mimeType: "application/json",
  payTo: PAY_TO,
  maxTimeoutSeconds: 60,
  asset,
  extra,
});
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const header = req.headers["x-payment"];
  if (!header) {
    res.writeHead(402, { "content-type": "application/json" });
    res.end(JSON.stringify({ x402Version: 1, error: "payment_required", accepts: [accept(USDT, { name: "Tether USD", version: "1" }), accept(USDC, { name: "USDC", version: "2" })] }));
    return;
  }
  seen.push(JSON.parse(Buffer.from(String(header), "base64").toString()));
  if (refusePaid) {
    res.writeHead(402, { "content-type": "application/json" });
    res.end(JSON.stringify({ x402Version: 1, error: "insufficient_funds", accepts: [] }));
    return;
  }
  const receipt = Buffer.from(JSON.stringify({ success: true, transaction: TX, network: "celo" })).toString("base64");
  res.writeHead(200, { "content-type": "application/json", "x-payment-response": receipt });
  res.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
});
let url = "";
before(async () => {
  await migrate();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/cencori/v1/chat/completions`;
});
after(() => server.close());

test("only the buy coin, at or under the catalogue price, is ever offered for signing", () => {
  const accepts = [
    { asset: USDT, maxAmountRequired: "10000" },
    { asset: USDC.toLowerCase(), maxAmountRequired: "10000" },
    { asset: USDC, maxAmountRequired: "10001" },
    { asset: USDC, amount: "0" },
  ];
  assert.deepEqual(affordable(accepts, USDC, 10_000n), [accepts[1]]);
});

test("a buy call is paid in USDC with one v1 authorisation and logged with its settlement", async () => {
  const r = await buyFetch("cencori.chat", { method: "POST", body: "{}" }, url);
  assert.equal(r.status, 200);
  assert.equal(completionText(await r.json()), "ok");
  const p = seen.at(-1)!;
  assert.equal(p.x402Version, 1);
  assert.equal(p.network, "celo");
  assert.equal(p.payload?.authorization?.from.toLowerCase(), account.address.toLowerCase());
  assert.equal(p.payload?.authorization?.to.toLowerCase(), PAY_TO.toLowerCase());
  assert.equal(p.payload?.authorization?.value, "10000");
  const [last] = await recentBuyCalls(1);
  assert.equal(last.tx, TX);
  assert.equal(last.ok, 1);
  assert.equal(last.token, "USDC");
});

test("past the day's cap, buy is not used and nothing is signed", async () => {
  const before = seen.length;
  await assert.rejects(buyFetch("cencori.chat", { method: "POST", body: "{}" }, url), /budget for today is spent/);
  assert.equal(seen.length, before);
});

test("a price above the catalogue's is refused before signing", async () => {
  env.BUY_DAILY_USD = "1";
  price = "20000";
  const before = seen.length;
  await assert.rejects(buyFetch("cencori.chat", { method: "POST", body: "{}" }, url), /did not offer USDC at or under 0.01/);
  assert.equal(seen.length, before);
});

test("buy is not used when the agent cannot spare the price", async () => {
  (chain.publicClient as { readContract: unknown }).readContract = async () => 5_000n;
  price = "10000";
  const before = seen.length;
  await assert.rejects(buyFetch("cencori.chat", { method: "POST", body: "{}" }, url), /spare for buy/);
  assert.equal(seen.length, before);
});

test("an agent's payment for a Telegram member is credited the way the instalments read it", () => {
  assert.equal(memoFor("tg:123:Ada"), "tg:123:Ada");
  assert.equal(memoFor("diaspora"), "x402:diaspora");
});

// 17 Oct to 2 Nov: the agent's USDC ran out, and every failing RPC read signed another payment
// that buy refused, about thirty a day. One refusal now pauses buy instead.
test("a payment buy refuses pauses buy, and is never counted as bought", async () => {
  env.BUY_DAILY_USD = "1";
  price = "10000";
  refusePaid = true;
  const paidBefore = (await paidBuyCalls()).length;
  const r = await buyFetch("chainstack.celo", { method: "POST", body: "{}" }, url.replace("/cencori/v1/chat/completions", "/chainstack/celo"));
  assert.equal(r.status, 402);
  const [refused] = await failedBuyCalls(1);
  assert.equal(refused.note, "HTTP 402");
  assert.equal((await paidBuyCalls()).length, paidBefore);

  const signed = seen.length;
  await assert.rejects(buyFetch("chainstack.celo", { method: "POST", body: "{}" }, url), /paused until/);
  assert.equal(seen.length, signed, "nothing is signed while paused");
});
