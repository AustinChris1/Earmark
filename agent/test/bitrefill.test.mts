import "./setup-env.mts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { priceFor, toOperator, type Operator } from "../src/bitrefill.js";

// Shaped like a real Bitrefill product: MTN Nigeria sells fixed packages below face value.
const mtn: Operator = toOperator({
  id: "mtn-nigeria", name: "MTN Nigeria", country_code: "NG", currency: "NGN",
  in_stock: true, recipient_type: "phone_number",
  range: { min: 5, max: 50000, step: 1, price_rate: 0.9254 },
  packages: [
    { id: "mtn-nigeria<&>5", value: "5", price: 5 },
    { id: "mtn-nigeria<&>50", value: "50", price: 47 },
    { id: "mtn-nigeria<&>100", value: "100", price: 93 },
  ],
});

test("a product becomes an operator, keeping what the agent needs", () => {
  assert.equal(mtn.phone, true);
  assert.equal(mtn.currency, "NGN");
  assert.deepEqual(mtn.range, { min: 5, max: 50000, step: 1 });
  assert.equal(mtn.packages.length, 3);
  // a gift card is not a phone top-up
  assert.equal(toOperator({ id: "g", name: "G", country_code: "NG", currency: "NGN", recipient_type: "email" }).phone, false);
});

test("an exact package is used, and its price can sit below face value", () => {
  const q = priceFor(mtn, 100);
  assert.equal(q.value, 100);
  assert.equal(q.price, 93);
  assert.equal(q.packageId, "mtn-nigeria<&>100");
});

// Ghana for a Nigerian account: price is in naira, value in cedis. Treating 5277 as cedis
// would overstate the cost by about a hundred times.
test("price is in the account's billing currency, not the phone's", () => {
  const ghana: Operator = toOperator({
    id: "mtn-ghana", name: "MTN Ghana", country_code: "GH", currency: "GHS",
    in_stock: true, recipient_type: "phone_number",
    range: { min: 25, max: 498, step: 1, price_rate: 105.54 },
    packages: [{ id: "mtn-ghana<&>50", value: "50", price: 5277 }],
  });
  const q = priceFor(ghana, 50);
  assert.equal(q.value, 50);
  assert.equal(q.currency, "GHS", "the phone still receives cedis");
  assert.equal(q.price, 5277, "the account is charged in its own currency");
  assert.equal(ghana.rate, 105.54);
});

// A data bundle's value is a label; its face value hides in `amount`.
test("a data bundle keeps its label and finds its real value", () => {
  const data: Operator = toOperator({
    id: "airtel-data-nigeria", name: "Airtel Data", country_code: "NG", currency: "NGN",
    in_stock: true, recipient_type: "phone_number",
    packages: [
      { id: "a<&>1.5gb weekly", value: "1.5gb weekly", price: 960, amount: 1000 },
      { id: "a<&>3gb", value: "3gb", price: 1891, amount: 2000 },
    ],
  });
  assert.equal(data.packages.length, 2, "neither package may be dropped as NaN");
  const q = priceFor(data, 1000);
  assert.equal(q.value, 1000);
  assert.equal(q.label, "1.5gb weekly");
  assert.equal(q.price, 960);
});

test("an amount with no package rounds up to the next one, never down", () => {
  const q = priceFor(mtn, 60);
  assert.equal(q.value, 100, "60 must not be served by the 50 package");
  assert.equal(q.packageId, "mtn-nigeria<&>100");
});

test("a free amount is converted at the operator's own rate", () => {
  const free: Operator = { ...mtn, packages: [] };
  assert.equal(priceFor(free, 250).price, 232, "250 naira of airtime at 0.9254");
  assert.equal(priceFor({ ...free, rate: null }, 250).price, 250, "no rate means face value");
  assert.equal(priceFor(free, 250).packageId, null);
});

test("an impossible amount is refused with what is actually on offer", () => {
  const free: Operator = { ...mtn, packages: [], range: { min: 5, max: 100, step: 1 } };
  assert.throws(() => priceFor(free, 999), /does not sell 999 NGN.*5–100/s);
  assert.throws(() => priceFor({ ...mtn, inStock: false }, 100), /out of stock/);
});
