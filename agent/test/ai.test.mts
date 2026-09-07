import "./setup-env.mts";

import assert from "node:assert/strict";
import { test } from "node:test";
import { validateExtraction } from "../src/ai.js";

const REAL = "0xd6dba363d1A45e2Bad96b94C1235F20D22A80216";
const OTHER = "0x000000000000000000000000000000000000dEaD";
const MSG = `collect 450 USDT for Chioma's school fees, pay ${REAL}`;

test("a well formed extraction is accepted", () => {
  const r = validateExtraction(MSG, {
    amount: "450",
    token: "USDT",
    destination: REAL,
    label: "Chioma's school fees",
  });
  assert.ok(r, "should parse");
  assert.equal(r.destination, REAL);
  assert.equal(r.token.symbol, "USDT");
  assert.equal(r.amount.toString(), "450000000", "450 USDT at 6 decimals");
});

test("an address the user never wrote is refused", () => {
  // The worst possible failure: money sent to a stranger, permanently, because the
  // destination cannot be changed once a drive is open.
  const r = validateExtraction(MSG, {
    amount: "450",
    token: "USDT",
    destination: OTHER,
    label: "Chioma's school fees",
  });
  assert.equal(r, null, "an invented destination must never be accepted");
});

test("an amount the user never wrote is refused", () => {
  const r = validateExtraction(MSG, {
    amount: "45000",
    token: "USDT",
    destination: REAL,
    label: "fees",
  });
  assert.equal(r, null, "a misread number must not become the target");
});

test("an unsupported token is refused", () => {
  const r = validateExtraction(`send 450 DOGE to ${REAL}`, {
    amount: "450",
    token: "DOGE",
    destination: REAL,
    label: "fees",
  });
  assert.equal(r, null);
});

test("decimals follow the token, not a default", () => {
  const msg = `collect 450 KESm for the term, pay ${REAL}`;
  const r = validateExtraction(msg, { amount: "450", token: "KESm", destination: REAL, label: "term" });
  assert.ok(r);
  assert.equal(r.amount.toString(), "450000000000000000000", "KESm is 18 decimals");
});

test("case insensitive tokens and addresses still match", () => {
  const r = validateExtraction(`pay 450 usdt to ${REAL.toLowerCase()}`, {
    amount: "450",
    token: "usdt",
    destination: REAL,
    label: "fees",
  });
  assert.ok(r, "people do not type checksummed addresses or exact tickers");
});

test("a missing field is refused", () => {
  assert.equal(validateExtraction(MSG, { amount: "450", token: "USDT", destination: REAL }), null);
  assert.equal(validateExtraction(MSG, {}), null);
});
