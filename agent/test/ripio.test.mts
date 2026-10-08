import assert from "node:assert/strict";
import { test } from "node:test";
import { offrampUrl, onrampUrl, rampCountry } from "../src/ripio.js";

const WALLET = "0x909e4e085Ea683194b8611b721b94EF9DE1e45cA";

test("an on-ramp link has every parameter Ripio needs to skip its form", () => {
  const u = new URL(onrampUrl("wARS", "10000", WALLET)!);
  assert.equal(u.origin + u.pathname, "https://ramp.ripio.com/");
  assert.equal(u.searchParams.get("country"), "AR");
  assert.equal(u.searchParams.get("chain"), "42220");
  assert.equal(u.searchParams.get("token"), "WARS");
  assert.equal(u.searchParams.get("amount"), "10000");
  assert.equal(u.searchParams.get("address"), WALLET);
});

test("each coin maps to the country Ripio serves it in", () => {
  assert.equal(rampCountry("wBRL"), "BR");
  assert.equal(rampCountry("wMXN"), "MX");
  assert.equal(rampCountry("wCOP"), "CO");
});

test("the off-ramp link goes to /offramp and carries no wallet", () => {
  const u = new URL(offrampUrl("wBRL", "250.5")!);
  assert.equal(u.pathname, "/offramp");
  assert.equal(u.searchParams.get("token"), "WBRL");
  assert.equal(u.searchParams.get("amount"), "250.5");
  assert.equal(u.searchParams.get("address"), null);
});

test("amounts are rounded up to cents, so a ramp never buys a fraction short", () => {
  assert.equal(new URL(onrampUrl("wARS", "1607.413")!).searchParams.get("amount"), "1607.42");
});

test("coins Ripio does not ramp, and junk input, give no link rather than a broken one", () => {
  assert.equal(onrampUrl("cNGN", "100"), undefined);
  assert.equal(onrampUrl("wPEN", "100"), undefined);
  assert.equal(new URL(onrampUrl("wARS", "-5", "not-an-address")!).searchParams.get("amount"), null);
  assert.equal(new URL(onrampUrl("wARS", "5", "not-an-address")!).searchParams.get("address"), null);
});
