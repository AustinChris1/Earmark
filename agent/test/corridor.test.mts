import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address, Hex } from "viem";
import { settle, localToBuy, payOptions, routeFor, withHeadroom, type CorridorDeps, type CorridorIntent } from "../src/corridor.js";
import { tokenBySymbol } from "../src/config.js";

const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as Address;
const USAT = "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771" as Address;
const CNGN = "0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f" as Address;
const WARS = "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D" as Address;
const PAYER = "0x000000000000000000000000000000000000bEEF" as Address;
const NAMES: Record<string, string> = { [USDT]: "USDT", [USAT]: "USAT", [CNGN]: "cNGN", [WARS]: "wARS" };
const name = (a: Address) => NAMES[a] ?? a;
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;

type Q = { buyAmount: bigint; takerPays: bigint; expiresAt: Date };

// A fake market at 1,362.5 cNGN per USDT (6 decimals both sides), recording everything that happened.
type FakeDrive = { token?: Address; target: bigint; raised: bigint; closed: boolean };
function fakeDeps(over: Partial<CorridorDeps<Q>> = {}, drive: FakeDrive = { target: 7_000_000_000n, raised: 0n, closed: false }) {
  const log: string[] = [];
  let n = 0;
  const deps: CorridorDeps<Q> = {
    usdt: USDT,
    usat: USAT,
    readDrive: async () => ({ token: CNGN, ...drive }),
    firmExactIn: async (_s, _b, sellAmount) => ({ buyAmount: sellAmount - sellAmount / 4000n, takerPays: sellAmount, expiresAt: new Date(Date.now() + 60_000) }),
    firmExactOut: async (_s, _b, buyAmount) => ({ buyAmount, takerPays: (buyAmount * 2n) / 2725n, expiresAt: new Date(Date.now() + 60_000) }),
    execute: async (q, sell, buy) => {
      log.push(`swap ${name(sell)}->${name(buy)} ${q.takerPays}`);
      return { swapHash: tx(++n), received: q.buyAmount };
    },
    cancel: async () => void log.push("cancel"),
    contribute: async (_id, _t, amount) => {
      log.push(`contribute ${amount}`);
      return tx(++n);
    },
    refund: async (token, _to, amount) => {
      log.push(`refund ${name(token)} ${amount}`);
      return tx(++n);
    },
    setStatus: async (_id, s) => void log.push(`status ${s}`),
    ...over,
  };
  return { deps, log };
}

const intent = (o: Partial<CorridorIntent> = {}): CorridorIntent => ({
  id: "i1",
  drive_id: 8,
  payer: PAYER,
  pay_token: USDT,
  pay_amount: withHeadroom(2_000_000n),
  pay_tx: tx(999),
  want_local: 2_725_000_000n,
  memo: "fx:@ada",
  status: "received",
  ...o,
});

test("headroom is one percent, rounded up", () => {
  assert.equal(withHeadroom(2_000_000n), 2_020_000n);
  assert.equal(withHeadroom(1n), 2n);
});

test("never buys more than the drive still needs", () => {
  assert.equal(localToBuy(5_000n, 7_000n, 3_000n), 4_000n);
  assert.equal(localToBuy(5_000n, 7_000n, 7_000n), 0n);
  assert.equal(localToBuy(5_000n, 0n, 0n), 5_000n, "a drive with no target takes any amount");
});

test("a USDT payment is swapped, contributed, and the unused headroom is returned", async () => {
  const { deps, log } = fakeDeps();
  const r = await settle(intent(), deps);
  assert.equal(r.status, "contributed");
  assert.deepEqual(log, ["status swapping", "swap USDT->cNGN 2000000", "contribute 2725000000", "refund USDT 20000", "status contributed"]);
});

test("USA₮ is hopped to USDT before the corridor swap", async () => {
  const { deps, log } = fakeDeps();
  const r = await settle(intent({ pay_token: USAT }), deps);
  assert.equal(r.status, "contributed");
  assert.equal(log[1], "swap USAT->USDT 2020000");
  assert.equal(log[2], "swap USDT->cNGN 2000000");
});

test("if the rate moves past the agreed maximum, nothing is swapped and everything goes back", async () => {
  const { deps, log } = fakeDeps({
    firmExactOut: async (_s, _b, buyAmount) => ({ buyAmount, takerPays: 2_100_000n, expiresAt: new Date(Date.now() + 60_000) }),
  });
  const r = await settle(intent(), deps);
  assert.equal(r.status, "refunded");
  assert.deepEqual(log, ["status swapping", "cancel", "refund USDT 2020000", "status refunded"]);
});

test("a full or closed drive returns the payment without swapping", async () => {
  const full = fakeDeps({}, { target: 7_000_000_000n, raised: 7_000_000_000n, closed: false });
  assert.equal((await settle(intent(), full.deps)).status, "refunded");
  assert.ok(!full.log.some((l) => l.startsWith("swap")));
  const closed = fakeDeps({}, { target: 7_000_000_000n, raised: 0n, closed: true });
  assert.equal((await settle(intent(), closed.deps)).status, "refunded");
});

test("a share bigger than what is left is trimmed, and the extra dollars come back", async () => {
  const { deps, log } = fakeDeps({}, { target: 7_000_000_000n, raised: 6_000_000_000n, closed: false });
  const r = await settle(intent(), deps);
  assert.equal(r.status, "contributed");
  assert.ok(log.includes("contribute 1000000000"), log.join(" | "));
});

test("a failed swap returns the dollars", async () => {
  const { deps, log } = fakeDeps({ execute: async () => Promise.reject(new Error("reverted")) });
  const r = await settle(intent(), deps);
  assert.equal(r.status, "refunded");
  assert.ok(log.includes("refund USDT 2020000"));
});

test("if the drive will not take the swapped coin, the coin and the change both go back", async () => {
  const { deps, log } = fakeDeps({ contribute: async () => Promise.reject(new Error("OverTarget")) });
  const r = await settle(intent(), deps);
  assert.equal(r.status, "refunded");
  assert.ok(log.includes("refund cNGN 2725000000"), log.join(" | "));
  assert.ok(log.includes("refund USDT 20000"), log.join(" | "));
});

test("which coins each drive can be paid in", () => {
  assert.deepEqual(payOptions(tokenBySymbol("USDT")), ["USAT", "cNGN", "wARS", "wBRL"]);
  assert.deepEqual(payOptions(tokenBySymbol("cNGN")), ["USDT", "USAT", "wARS", "wBRL"]);
  assert.deepEqual(payOptions(tokenBySymbol("USAT")), [], "Textile has no corridor into USA₮");
  assert.equal(routeFor(tokenBySymbol("wARS"), tokenBySymbol("USDT")), "direct");
  assert.equal(routeFor(tokenBySymbol("wARS"), tokenBySymbol("cNGN")), "via-usdt");
  assert.equal(routeFor(tokenBySymbol("USDT"), tokenBySymbol("USDT")), null);
});

test("pesos pay a USD₮ drive in one swap, and the unused pesos go back", async () => {
  const { deps, log } = fakeDeps({}, { token: USDT, target: 10_000_000n, raised: 0n, closed: false });
  const r = await settle(intent({ pay_token: WARS, pay_amount: 3_300n * 10n ** 18n, want_local: 2_000_000n }), deps);
  assert.equal(r.status, "contributed");
  assert.equal(log.filter((l) => l.startsWith("swap")).length, 1, log.join(" | "));
  assert.ok(log[1].startsWith("swap wARS->USDT"), log.join(" | "));
  assert.ok(log.some((l) => l.startsWith("refund wARS")), log.join(" | "));
});

test("pesos into a naira drive go through USDT first", async () => {
  const { deps, log } = fakeDeps();
  const r = await settle(intent({ pay_token: WARS, pay_amount: 3_300n * 10n ** 18n }), deps);
  assert.equal(r.status, "contributed");
  assert.ok(log[1].startsWith("swap wARS->USDT"), log.join(" | "));
  assert.ok(log[2].startsWith("swap USDT->cNGN"), log.join(" | "));
});

test("a coin that cannot reach the drive's coin goes straight back", async () => {
  const { deps, log } = fakeDeps({}, { token: USAT, target: 10_000_000n, raised: 0n, closed: false });
  const r = await settle(intent(), deps);
  assert.equal(r.status, "refunded");
  assert.ok(!log.some((l) => l.startsWith("swap")), log.join(" | "));
});
