import "./setup-env.mts";

import assert from "node:assert/strict";
import { test } from "node:test";
import { attachMessage, checkBillInput } from "../src/billService.js";
import { body, PROVIDERS } from "../src/abapay.js";
import { intlNumber } from "../src/abapayIntl.js";
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

test("a phone abroad is sent in full international form, however it was typed", () => {
  assert.equal(intlNumber("54", "+54 9 11 2345-6789"), "5491123456789");
  assert.equal(intlNumber("54", "0054 9 11 2345 6789"), "5491123456789");
  assert.equal(intlNumber("54", "9 11 2345 6789"), "5491123456789");
  assert.equal(intlNumber("55", "011 98765 4321"), "551198765432" + "1");
  assert.equal(intlNumber("54", "+55 11 98765 4321"), null, "a Brazilian number is not an Argentine one");
  assert.equal(intlNumber("54", "123"), null);
});

test("a top-up abroad asks AbaPay for the plan by code, in the coin the drive holds", () => {
  const b = body(
    {
      category: "INTERNATIONAL",
      serviceID: "foreign-airtime",
      network: "ARGENTINA CLARO",
      billersCode: "5491123456789",
      nairaAmount: 2492.44,
      intl: { countryCode: "AR", operatorId: "317", operatorName: "Argentina Claro", variationCode: "14462", foreignAmount: "2000.00", currency: "ARS" },
    },
    "USAT",
  ) as Record<string, unknown>;
  assert.equal(b.serviceID, "foreign-airtime");
  assert.equal(b.serviceCategory, "INTERNATIONAL");
  assert.equal(b.variation_code, "14462");
  assert.equal(b.operator_id, "317");
  assert.equal(b.country_code, "AR");
  assert.equal(b.product_type_id, "1");
  assert.equal(b.token, "USA₮", "the exact spelling, or AbaPay silently charges USDC");
});
