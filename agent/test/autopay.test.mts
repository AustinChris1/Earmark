import "./setup-env.mts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { privateKeyToAccount } from "viem/accounts";

const { dueDay, payerKey, payer } = await import("../src/autopay.js");
const { env } = await import("../src/config.js");

const at = (iso: string) => new Date(iso);

test("auto top-up runs once a day, after the hour, up to and including the last day", () => {
  assert.equal(dueDay(at("2026-11-03T08:59:00Z"), "2026-11-08", 9, undefined), null, "before the hour");
  assert.equal(dueDay(at("2026-11-03T09:00:00Z"), "2026-11-08", 9, undefined), "2026-11-03");
  assert.equal(dueDay(at("2026-11-03T15:00:00Z"), "2026-11-08", 9, "2026-11-03"), null, "already ran today");
  assert.equal(dueDay(at("2026-11-04T09:10:00Z"), "2026-11-08", 9, "2026-11-03"), "2026-11-04");
  assert.equal(dueDay(at("2026-11-08T23:00:00Z"), "2026-11-08", 9, "2026-11-07"), "2026-11-08", "the last day still runs");
  assert.equal(dueDay(at("2026-11-09T09:00:00Z"), "2026-11-08", 9, "2026-11-08"), null, "after the end date");
  assert.equal(dueDay(at("2026-11-04T09:00:00Z"), "", 9, undefined), null, "off without an end date");
});

test("the auto-pay wallet is its own address, derived the same way everywhere", () => {
  const agent = privateKeyToAccount(env.AGENT_PRIVATE_KEY);
  assert.notEqual(payer.address, agent.address);
  assert.equal(privateKeyToAccount(payerKey(env.AGENT_PRIVATE_KEY)).address, payer.address);
});
