import "./setup-env.mts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { billCategoryKeyboard, menuKeyboard, MENU, phoneCountryKeyboard, replyMenu } from "../src/keyboards.js";

const buttons = (kb: { inline_keyboard: { text: string; callback_data?: string }[][] }) => kb.inline_keyboard.flat();

test("the main menu has one bill entry and does not say Nigerian", () => {
  const labels = buttons(menuKeyboard()).map((b) => b.text);
  assert.ok(labels.includes(MENU.bill));
  assert.ok(!labels.some((l) => /nigeria/i.test(l)), labels.join(" | "));
  assert.ok(!replyMenu().keyboard.flat().some((b) => /nigeria/i.test(b.text)));
});

test("a bill asks what first: phone top-up, electricity, or something else", () => {
  const data = buttons(billCategoryKeyboard()).map((b) => b.callback_data);
  assert.deepEqual(data.slice(0, 3), ["bl:phone", "bl:cat:E", "bl:out"]);
});

test("Nigeria is one country in the phone top-up list, routed to the Nigerian airtime flow", () => {
  const kb = buttons(phoneCountryKeyboard());
  assert.equal(kb[0].callback_data, "bl:ng");
  assert.ok(kb.some((b) => b.callback_data === "ab:c:AR"));
  assert.ok(kb.some((b) => b.callback_data === "ab:c:other"));
});
