import "./setup-env.mts";

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addIntent,
  drivesWithPlans,
  dueInstalments,
  getIntent,
  getMeta,
  hasPlan,
  insertDrive,
  insertPayment,
  instalmentsFor,
  markForwarded,
  markNudged,
  migrate,
  nextInstalment,
  pendingIntents,
  planCountFor,
  reconcileInstalments,
  rekeyMember,
  replacePlan,
  setMeta,
  setShare,
  sharesFor,
} from "../src/db.js";

const DRIVE = 990001;
const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";
const u = (n: string) => (BigInt(n) * 1_000_000n).toString();

function planFor(shares: { tg_id: string; name: string; amount: string }[], count: number, startOfDay: number) {
  return shares.flatMap((s) => {
    const total = BigInt(s.amount);
    const per = total / BigInt(count);
    const remainder = total - per * BigInt(count);
    return Array.from({ length: count }, (_, i) => ({
      drive_id: DRIVE,
      tg_id: s.tg_id,
      seq: i + 1,
      name: s.name,
      amount: (i === count - 1 ? per + remainder : per).toString(),
      due_at: startOfDay + i * 7 * 86_400,
    }));
  });
}

test("instalment plan survives a round trip through the database", async () => {
  await migrate();

  await insertDrive({
    id: DRIVE,
    chat_id: "test-chat",
    label: "Term 1 fees",
    token: USDT,
    destination: "0x000000000000000000000000000000000000dEaD",
    target: u("300"),
    deadline: 0,
    collector_tg: "999",
    collector_name: "@collector",
    created_tx: null,
  });

  await setShare({ drive_id: DRIVE, tg_id: "@ada", name: "@ada", amount: u("200") });
  await setShare({ drive_id: DRIVE, tg_id: "222", name: "@emeka", amount: u("100") });
  assert.equal((await sharesFor(DRIVE)).length, 2, "both shares stored");

  // The first /pay swaps the @handle key for the numeric id.
  await rekeyMember(DRIVE, "@ada", "111", "@ada");
  const keys = (await sharesFor(DRIVE)).map((s) => s.tg_id).sort();
  assert.deepEqual(keys, ["111", "222"], "share rekeyed to the numeric id");

  const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const shares = await sharesFor(DRIVE);
  await replacePlan(DRIVE, planFor(shares, 4, startOfDay));

  const rows = await instalmentsFor(DRIVE);
  assert.equal(rows.length, 8, "4 instalments each for 2 people");
  assert.ok(await hasPlan(DRIVE));
  assert.ok((await drivesWithPlans()).includes(DRIVE));

  // Parts must sum back to the share exactly, remainder included.
  const adaTotal = rows.filter((r) => r.tg_id === "111").reduce((a, r) => a + BigInt(r.amount), 0n);
  assert.equal(adaTotal.toString(), u("200"), "instalments sum to the share");

  // Ada pays 100 of her 200: exactly two of four instalments.
  await insertPayment({
    tx_hash: "0xtest1",
    drive_id: DRIVE,
    payer: "0xpayer",
    amount: u("100"),
    memo: "tg:111:@ada",
    block: 1,
  });
  await reconcileInstalments(DRIVE);

  assert.deepEqual(await planCountFor(DRIVE, "111"), { total: 4, paid: 2 }, "two instalments settled");
  assert.equal((await nextInstalment(DRIVE, "111"))?.seq, 3, "next unpaid is the third");
  assert.deepEqual(await planCountFor(DRIVE, "222"), { total: 4, paid: 0 }, "emeka untouched");

  // Reconciling twice must not double count.
  await reconcileInstalments(DRIVE);
  assert.deepEqual(await planCountFor(DRIVE, "111"), { total: 4, paid: 2 }, "reconcile is idempotent");

  // Only instalments whose due date has arrived may be nudged. Ada is paid up to seq 2 and her
  // seq 3 is a fortnight out, so the only thing due today is emeka's first.
  const due = await dueInstalments(startOfDay + 60, startOfDay + 60);
  assert.ok(
    due.some((d) => d.tg_id === "222" && d.seq === 1),
    "emeka's first instalment is due and unnudged",
  );
  assert.ok(
    !due.some((d) => d.tg_id === "111"),
    "ada is not chased for an instalment that is not due yet",
  );

  await markNudged(DRIVE, "222", 1, startOfDay + 60);
  const afterNudge = await dueInstalments(startOfDay + 60, startOfDay - 1);
  assert.ok(!afterNudge.some((d) => d.tg_id === "222" && d.seq === 1), "nudged instalment goes quiet");
});

test("x402 intents are recorded and settle once", async () => {
  await migrate();
  const id = "intent-test-1";
  await addIntent({ id, drive_id: DRIVE, token: USDT, amount: u("5"), payer_name: "uncle" });
  assert.ok((await pendingIntents()).some((i) => i.id === id), "intent is pending");
  await markForwarded(id, "0xforwarded");
  assert.equal((await getIntent(id))?.forwarded_tx, "0xforwarded");
  assert.ok(!(await pendingIntents()).some((i) => i.id === id), "forwarded intent is no longer pending");
});

test("meta round trips", async () => {
  await migrate();
  await setMeta("last_block", "12345");
  assert.equal(await getMeta("last_block"), "12345");
  await setMeta("last_block", "99999");
  assert.equal(await getMeta("last_block"), "99999", "meta upserts");
});
