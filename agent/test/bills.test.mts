import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address, Hex } from "viem";
import { billTarget, maskNumber, proRata, settleBill, type BillDeps } from "../src/bills.js";
import type { Bill, BillResult } from "../src/abapay.js";

const AGENT = "0x178977E82c4Df50D5a7465F4495170DFF9275363" as Address;
const USAT = "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771" as Address;
const ADA = "0x00000000000000000000000000000000000000Ad" as Address;
const EMEKA = "0x00000000000000000000000000000000000000E1" as Address;
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;

const bill: Bill = { category: "ELECTRICITY", serviceID: "ikeja-electric", network: "IKEJA-ELECTRIC", billersCode: "45000000000", nairaAmount: 5000 };

test("the target carries two percent headroom, rounded up", () => {
  assert.equal(billTarget(3_864_636n), 3_941_929n);
});

test("a meter number is shown recognisably but not in full", () => {
  assert.equal(maskNumber("45000000123"), "4500•••0123");
  assert.equal(maskNumber("0801234"), "0801234");
});

test("change is returned in proportion to what each person paid, exactly", () => {
  const out = proRata([{ payer: ADA, amount: 3_000_000n }, { payer: EMEKA, amount: 1_000_000n }, { payer: ADA, amount: 1_000_000n }], 100_001n, AGENT);
  assert.equal(out.reduce((a, s) => a + s.amount, 0n), 100_001n);
  assert.equal(out.find((s) => s.payer === ADA)!.amount, 80_001n, "Ada paid 4/5 and takes the rounding dust");
  assert.equal(out.find((s) => s.payer === EMEKA)!.amount, 20_000n);
});

test("money the agent forwarded for someone is not refunded to the agent itself", () => {
  const out = proRata([{ payer: AGENT, amount: 5n }, { payer: ADA, amount: 5n }], 10n, AGENT);
  assert.deepEqual(out, [{ payer: ADA, amount: 10n }]);
});

function deps(over: Partial<BillDeps> = {}) {
  const log: string[] = [];
  let n = 0;
  const d: BillDeps = {
    agent: AGENT,
    token: USAT,
    pay: async () => ({ ok: true, status: "SUCCESS", purchasedCode: "1234-5678-9012-3456-7890", units: "41.2", settleTx: tx(1), requestId: "req_1", quote: { asset: USAT, amount: 3_864_636n, payTo: AGENT } }) as BillResult,
    refund: async (to, amount) => {
      log.push(`refund ${to === ADA ? "Ada" : "Emeka"} ${amount}`);
      return tx(++n + 100);
    },
    balance: async () => 3_941_929n,
    setStatus: async (_id, s) => void log.push(`status ${s}`),
    ...over,
  };
  return { d, log };
}
const payments = [{ payer: ADA, amount: 1_970_965n }, { payer: EMEKA, amount: 1_970_964n }];

test("a full drive pays the bill and returns the unused headroom to the payers", async () => {
  const { d, log } = deps();
  const r = await settleBill(9, bill, 3_941_929n, payments, d);
  assert.equal(r.status, "paid");
  assert.deepEqual(log, ["status paying", "refund Ada 38647", "refund Emeka 38646", "status paid"]);
});

test("if AbaPay's price moved past the pool, nothing is paid and everyone gets their share back", async () => {
  const { d, log } = deps({ pay: async () => Promise.reject(new Error("The bill now costs more; nothing was paid.")) });
  const r = await settleBill(9, bill, 3_941_929n, payments, d);
  assert.equal(r.status, "refunded");
  assert.deepEqual(log, ["status paying", "refund Ada 1970965", "refund Emeka 1970964", "status refunded"]);
});

test("settled but not vended: people are only paid back once AbaPay's refund has actually arrived", async () => {
  const failed = { ok: false, status: "FAILED_VENDING", purchasedCode: null, units: null, settleTx: tx(1), requestId: "req_2", quote: { asset: USAT, amount: 3_864_636n, payTo: AGENT } } as BillResult;
  const waiting = deps({ pay: async () => failed, balance: async () => 0n });
  assert.equal((await settleBill(9, bill, 3_941_929n, payments, waiting.d)).status, "failed");
  assert.ok(!waiting.log.some((l) => l.startsWith("refund")));
  const back = deps({ pay: async () => failed });
  assert.equal((await settleBill(9, bill, 3_941_929n, payments, back.d)).status, "refunded");
});
