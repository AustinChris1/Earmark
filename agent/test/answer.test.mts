import "./setup-env.mts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { plainAnswer } from "../src/bot.js";
import { MENU } from "../src/keyboards.js";

test("a plain amount, address or label is the answer", () => {
  assert.equal(plainAnswer("450"), "450");
  assert.equal(plainAnswer("  0xabc  "), "0xabc");
  assert.equal(plainAnswer("Dad's wallet"), "Dad's wallet");
});

test("a leading slash reaches the bot in a group without being a real command", () => {
  assert.equal(plainAnswer("/450"), "450");
  assert.equal(plainAnswer("/0xabc"), "0xabc");
  assert.equal(plainAnswer("/Term 1 fees"), "Term 1 fees");
  assert.equal(plainAnswer("/450@Earmarked_bot"), "450");
  assert.equal(plainAnswer("/+5491112345678"), "+5491112345678");
});

test("real commands and menu buttons keep their own handlers", () => {
  assert.equal(plainAnswer("/split all"), null);
  assert.equal(plainAnswer("/pay@Earmarked_bot"), null);
  assert.equal(plainAnswer("/new 1 USDT 0xabc Rent"), null);
  assert.equal(plainAnswer("/close"), null);
  assert.equal(plainAnswer(MENU.pay), null);
  assert.equal(plainAnswer(""), null);
  assert.equal(plainAnswer("/"), null);
});

test("mentioning the bot is still just the answer", () => {
  assert.equal(plainAnswer("@Earmarked_bot 450", "Earmarked_bot"), "450");
  assert.equal(plainAnswer("@Earmarked_bot /450", "Earmarked_bot"), "450");
  assert.equal(plainAnswer("@Earmarked_bot /split all", "Earmarked_bot"), null);
});
