import "./setup-env.mts";

import assert from "node:assert/strict";
import { test } from "node:test";
import { attachMessage, checkBillInput } from "../src/billService.js";
import { PROVIDERS } from "../src/abapay.js";
import { signedBy } from "../src/x402.js";

test("a bill is checked the same way from the bot and the website", () => {
  const ok = checkBillInput("MTN", "0803 123-4567", 200);
  assert.ok(ok.ok && ok.number === "08031234567" && ok.provider.serviceID === "mtn");
  assert.equal(checkBillInput("nepa", "08031234567", 200).ok, false, "unknown provider");
  assert.equal(checkBillInput("ikeja", "meter-abc", 5000).ok, false, "not digits");
  assert.equal(checkBillInput("mtn", "08031234567", 50).ok, false, "under ₦100");
  assert.equal(checkBillInput("mtn", "08031234567", 150.5).ok, false, "not whole naira");
});

test("what the opener signs names the drive, the provider and the full number", () => {
  assert.equal(
    attachMessage(12, PROVIDERS.ikeja, "45012345678", 15000),
    "Earmark: when drive #12 is full, pay Ikeja Electric for 45012345678, N15,000.",
  );
});

test("the wallet behind an x402 payment is read from its signed authorisation", () => {
  const nonce = `0x${"22".repeat(32)}`;
  const header = Buffer.from(
    JSON.stringify({ x402Version: 2, payload: { signature: "0x", authorization: { from: "0x000000000000000000000000000000000000beef", nonce } } }),
  ).toString("base64");
  assert.deepEqual(signedBy(header), { payer: "0x000000000000000000000000000000000000bEEF", nonce });
  assert.deepEqual(signedBy(undefined), { payer: null, nonce: null });
  assert.deepEqual(signedBy("not base64 at all!"), { payer: null, nonce: null });
});
