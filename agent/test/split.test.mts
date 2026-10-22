import assert from "node:assert/strict";
import { test } from "node:test";
import { evenSplit, splitSlots } from "../src/split.js";

test("shares add up to the target exactly", () => {
  const shares = evenSplit(2_000_000n, 3); // 2 USDT at 6 decimals, three people
  assert.equal(shares.reduce((a, b) => a + b, 0n), 2_000_000n);
  assert.deepEqual(shares, [666_667n, 666_667n, 666_666n]);
});

test("an exact division has no remainder to hand out", () => {
  assert.deepEqual(evenSplit(90n, 3), [30n, 30n, 30n]);
});

test("one member takes the whole target", () => {
  assert.deepEqual(evenSplit(450n, 1), [450n]);
});

test("nobody to split between yields nothing rather than dividing by zero", () => {
  assert.deepEqual(evenSplit(450n, 0), []);
});

test("one person who has spoken still only owes a share of everyone in the chat", () => {
  assert.equal(splitSlots(1, 4), 4);
  assert.equal(evenSplit(2_000_000n, splitSlots(1, 4))[0], 500_000n);
  assert.equal(splitSlots(4, 4), 4);
  assert.equal(splitSlots(1, null), 1);
  assert.equal(splitSlots(0, 4), 0);
});
