import "./setup-env.mts";

import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptsFrom, authorizationWindow, checkChallenge, recordFromHistory, v1PaymentHeader, vendPhase } from "../src/abapay.js";

const USAT = "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771";
const USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const ABAPAY = "0x5df8aE2B963165b735B18Ca86B1ea448d2AA032C";

test("a challenge in the coin the drive holds is accepted, with the price read from it", () => {
  const q = checkChallenge([{ network: "eip155:42220", asset: USAT.toLowerCase(), maxAmountRequired: "758576", payTo: ABAPAY }], USAT);
  assert.equal(q.amount, 758576n);
  assert.equal(q.payTo, ABAPAY);
});

test("the silent USDC fallback is refused, so a USA₮ pool is never asked to sign for USDC", () => {
  assert.throws(
    () => checkChallenge([{ network: "eip155:42220", asset: USDC, maxAmountRequired: "758576", payTo: ABAPAY }], USAT),
    /nothing was signed/,
  );
});

test("a challenge with no price, or a zero one, is refused", () => {
  assert.throws(() => checkChallenge([], USAT));
  assert.throws(() => checkChallenge([{ network: "eip155:42220", asset: USAT, maxAmountRequired: "0", payTo: ABAPAY }], USAT));
});

test("the price is read from the 402 body, not from a version-2 header", () => {
  const body = { x402Version: 1, accepts: [{ scheme: "exact", network: "eip155:42220", asset: USAT, maxAmountRequired: "390000", payTo: ABAPAY }] };
  const q = checkChallenge(acceptsFrom(body), USAT);
  assert.equal(q.amount, 390000n);
  assert.equal(acceptsFrom({ x402Version: 2 }).length, 0);
});

test("the authorization is already valid for a day, and a short challenge still leaves time to settle", () => {
  const w = authorizationWindow(1_000_000, 86_400);
  assert.equal(w.validAfter, 1_000_000 - 86_400);
  assert.equal(w.validBefore, 1_000_000 + 86_400);
  const short = authorizationWindow(1_000_000, 30);
  assert.equal(short.validBefore, 1_000_000 + 900);
});

test("a settlement still being delivered is not treated as paid or failed", () => {
  assert.equal(vendPhase("TIMEOUT"), "pending");
  assert.equal(vendPhase("PROCESSING"), "pending");
  assert.equal(vendPhase("SUCCESS"), "paid");
  assert.equal(vendPhase("FAILED_VENDING"), "failed");
  const row = recordFromHistory(
    [{ status: "PROCESSING", tx_hash: "0xabc", x402_settle_tx: "0xabc", request_id: "req_9", purchased_code: null, units: null }],
    "0xAbC",
  );
  assert.equal(row?.status, "PROCESSING");
  assert.equal(row?.requestId, "req_9");
  assert.equal(recordFromHistory([{ status: "SUCCESS", tx_hash: "0xdef" }], "0xabc"), null);
});

test("the payment AbaPay is given is the flat version-1 envelope on network celo", () => {
  const header = v1PaymentHeader(
    { from: ABAPAY, to: ABAPAY, value: "390000", validAfter: "1", validBefore: "2", nonce: `0x${"ab".repeat(32)}` },
    `0x${"cd".repeat(65)}`,
  );
  const decoded = JSON.parse(Buffer.from(header, "base64").toString());
  assert.equal(decoded.x402Version, 1);
  assert.equal(decoded.scheme, "exact");
  assert.equal(decoded.network, "celo");
  assert.equal(decoded.payload.authorization.value, "390000");
  assert.equal(decoded.accepted, undefined);
});
