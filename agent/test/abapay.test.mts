import "./setup-env.mts";

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkChallenge } from "../src/abapay.js";

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
