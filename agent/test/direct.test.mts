import assert from "node:assert/strict";
import { test } from "node:test";
import { getAddress } from "viem";
import {
  ABAPAY_VAULT,
  decideDirect,
  directMemo,
  displayTolerance,
  isDirectUserTransfer,
  payerFromDirectMemo,
  raisedAtTransfer,
  watchTokens,
  type PoolDrive,
} from "../src/direct.js";
import { driveCard, exactAmount, memoName } from "../src/format.js";
import { tokenBySymbol, type TokenInfo } from "../src/config.js";
import type { DriveRow } from "../src/db.js";

const AGENT = "0x178977E82c4Df50D5a7465F4495170DFF9275363";
const USAT = "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771";
const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";
const USER = "0xc4f8f7507f4D573830f09b73086ce3FfDC0E4787";
const EARMARK = "0x93316de31b4f891c56cf3b65a3f96aa6b04192ae";
const PAYEE = "0x909e4e085Ea683194b8611b721b94EF9DE1e45cA";

function pool(over: Partial<PoolDrive> = {}): PoolDrive {
  return {
    id: 12,
    token: USAT,
    destination: AGENT,
    target: 387_384n,
    raised: 0n,
    raisedThen: 0n,
    closed: false,
    deadline: 0,
    openedAt: 1_000,
    label: "MTN 500",
    chatId: "1206974757",
    collectorTg: "1206974757",
    collectorName: "@thatcreator",
    ...over,
  };
}

function decide(over: Partial<Parameters<typeof decideDirect>[0]> = {}) {
  return decideDirect({
    amount: 390_000n,
    token: USAT,
    agent: AGENT,
    at: 2_000,
    decimals: 6,
    pools: [pool()],
    corridorPossible: false,
    ...over,
  });
}

test("half a displayed cent is the tolerance for a six-decimal coin", () => {
  assert.equal(displayTolerance(6), 5_000n);
});

test("one open drive takes the whole transfer", () => {
  assert.deepEqual(decide({ amount: 387_384n }), { kind: "credit", driveId: 12, credit: 387_384n, refund: 0n });
});

test("0.390000 against a 0.387384 drive fills it and returns the dust", () => {
  assert.deepEqual(decide(), { kind: "credit", driveId: 12, credit: 387_384n, refund: 2_616n });
});

test("a partial goes to the only open drive", () => {
  assert.deepEqual(decide({ amount: 100_000n, pools: [pool({ target: 387_384n })] }), {
    kind: "credit",
    driveId: 12,
    credit: 100_000n,
    refund: 0n,
  });
});

test("an exact remaining wins over another drive that could take a partial", () => {
  const small = pool({ id: 8, target: 78_294n, label: "MTN 100" });
  const exact = pool({ id: 13, target: 390_000n, label: "exact" });
  assert.deepEqual(decide({ pools: [small, exact] }), { kind: "credit", driveId: 13, credit: 390_000n, refund: 0n });
});

test("two drives with the same remaining stay ambiguous", () => {
  const a = pool({ id: 8, target: 390_000n });
  const b = pool({ id: 13, target: 390_000n });
  const d = decide({ pools: [a, b] });
  assert.equal(d.kind, "ambiguous");
  if (d.kind === "ambiguous") assert.deepEqual(d.driveIds, [8, 13]);
});

test("the only open-ended drive takes the whole transfer", () => {
  assert.deepEqual(decide({ amount: 50n, pools: [pool({ target: 0n })] }), { kind: "credit", driveId: 12, credit: 50n, refund: 0n });
});

test("an exact fixed drive wins over an open-ended one", () => {
  const openEnded = pool({ id: 1, target: 0n });
  const fixed = pool({ id: 2, target: 100n });
  assert.deepEqual(decide({ amount: 100n, pools: [openEnded, fixed] }), { kind: "credit", driveId: 2, credit: 100n, refund: 0n });
});

test("the stranded 0.39 notes the closed bill and does not fill the smaller open one", () => {
  const openSmall = pool({ id: 8, target: 78_294n, label: "MTN 100" });
  const closed = pool({ id: 12, target: 387_384n, raised: 387_384n, raisedThen: 0n, closed: true, label: "MTN 500" });
  assert.deepEqual(decide({ pools: [openSmall, closed], corridorPossible: true }), { kind: "noted", driveId: 12 });
});

test("a transfer far above the only open drive is not used to fill it", () => {
  assert.deepEqual(decide({ pools: [pool({ id: 8, target: 78_294n })] }), { kind: "overshoot", driveId: 8 });
});

test("a coin that could pay a different open drive is left unlabeled", () => {
  assert.deepEqual(decide({ amount: 800_000n, token: USDT, pools: [], corridorPossible: true }), { kind: "ignore" });
});

test("with nowhere to put it, the transfer stays held", () => {
  assert.deepEqual(decide({ pools: [], corridorPossible: false }), { kind: "held" });
});

test("a closed drive the amount does not fit is not named as the recipient", () => {
  const closed = pool({ closed: true, raised: 387_384n, raisedThen: 387_384n, target: 387_384n });
  assert.deepEqual(decide({ amount: 800_000n, pools: [closed], corridorPossible: false }), { kind: "held" });
});

test("two closed drives that both fit are not guessed", () => {
  const a = pool({ id: 9, closed: true, raised: 387_384n, raisedThen: 0n });
  const b = pool({ id: 12, closed: true, raised: 387_384n, raisedThen: 0n });
  assert.deepEqual(decide({ pools: [a, b] }), { kind: "held" });
});

test("a drive that is not the agent's cannot be paid by a transfer to the agent", () => {
  assert.deepEqual(decide({ pools: [pool({ destination: PAYEE })] }), { kind: "held" });
});

test("the wrong coin, a later drive, a past deadline, and an unknown open time are not credited", () => {
  assert.equal(decide({ pools: [pool({ token: USDT })] }).kind, "held");
  assert.equal(decide({ pools: [pool({ openedAt: 3_000 })] }).kind, "held");
  assert.equal(decide({ pools: [pool({ openedAt: 0 })] }).kind, "held");
  assert.equal(decide({ pools: [pool({ deadline: 1_500 })] }).kind, "held");
});

test("a zero transfer is ignored", () => {
  assert.equal(decide({ amount: 0n }).kind, "ignore");
});

test("raised at the transfer ignores a fill that landed afterwards", () => {
  const raised = raisedAtTransfer(387_384n, [{ block: 80_246_011, amount: 387_384n }], 80_245_922, true);
  assert.equal(raised, 0n);
  assert.equal(raisedAtTransfer(78_294n, [], 1, false), 78_294n);
  assert.equal(raisedAtTransfer(387_384n, [], 1, true), 0n);
});

test("only a plain transfer from the sender counts", () => {
  const base = { txFrom: USER, txTo: USAT, logFrom: USER, logTo: AGENT, token: USAT, agent: AGENT, earmark: EARMARK };
  assert.equal(isDirectUserTransfer(base), true);
  assert.equal(isDirectUserTransfer({ ...base, txFrom: AGENT }), false);
  assert.equal(isDirectUserTransfer({ ...base, txTo: EARMARK }), false);
  assert.equal(isDirectUserTransfer({ ...base, logFrom: ABAPAY_VAULT, txFrom: ABAPAY_VAULT }), false);
  assert.equal(isDirectUserTransfer({ ...base, txFrom: "0x00000000000000000000000000000000000000F1" }), false);
  assert.equal(isDirectUserTransfer({ ...base, txTo: PAYEE }), false);
});

test("a solo private chat with no split is the person who opened it", () => {
  assert.equal(
    directMemo({ payer: USER, credit: 387_384n, shares: [], verifiedTgId: null, chatId: "1206974757", collectorTg: "1206974757", collectorName: "@thatcreator" }),
    "tg:1206974757:@thatcreator",
  );
});

test("a transfer that equals one person's share is theirs", () => {
  const shares = [
    { tgId: "1", name: "Ada", left: 100n },
    { tgId: "2", name: "Emeka", left: 40n },
  ];
  assert.equal(directMemo({ payer: USER, credit: 100n, shares, verifiedTgId: null, chatId: "-100", collectorTg: "9", collectorName: "Ada" }), "tg:1:Ada");
});

test("a group payment that matches nobody stays on the sending address", () => {
  const memo = directMemo({
    payer: USER,
    credit: 25n,
    shares: [
      { tgId: "1", name: "Ada", left: 100n },
      { tgId: "2", name: "Emeka", left: 40n },
    ],
    verifiedTgId: null,
    chatId: "-100",
    collectorTg: "9",
    collectorName: "Ada",
  });
  assert.equal(memo, `direct:${getAddress(USER)}`);
});

test("a verified sender who still owes is ticked even when the amount matches someone else", () => {
  const shares = [
    { tgId: "1", name: "Ada", left: 10n },
    { tgId: "2", name: "Emeka", left: 100n },
  ];
  assert.equal(directMemo({ payer: USER, credit: 100n, shares, verifiedTgId: "1", chatId: "-100", collectorTg: null, collectorName: null }), "tg:1:Ada");
});

test("a direct memo shortens to the address, and yields the sender for a refund", () => {
  const memo = `direct:${getAddress(USER)}`;
  assert.equal(memoName(memo, AGENT), "0xc4f8…4787");
  assert.equal(payerFromDirectMemo(memo), getAddress(USER));
  assert.equal(payerFromDirectMemo("tg:1:Ada"), null);
});

test("a pool card shows the exact remaining and a wallet card keeps the lock", () => {
  const usat = tokenBySymbol("USAT") as TokenInfo;
  assert.equal(exactAmount(387_384n, usat), "0.387384 USAT");
  assert.equal(exactAmount(390_000n, usat), "0.39 USAT");
  const row: DriveRow = {
    id: 12,
    chat_id: "1206974757",
    label: "MTN",
    token: USAT,
    destination: AGENT,
    target: "387384",
    deadline: 0,
    collector_tg: "1206974757",
    collector_name: "@thatcreator",
    created_tx: null,
    closed: 0,
    token_symbol: "USAT",
    token_decimals: 6,
    created_at: 1,
  };
  const poolCard = driveCard(row, [], "", true);
  assert.match(poolCard, /0\.387384 USAT/);
  assert.match(poolCard, /only one open drive can take it/);
  assert.doesNotMatch(poolCard, /Pays only to this address/);
  const wallet = driveCard({ ...row, destination: PAYEE }, [], "", false);
  assert.match(wallet, /Pays only to this address/);
  assert.doesNotMatch(wallet, /only one open drive can take it/);
});

test("the scanner watches pay coins and USDC, not every token", () => {
  const known = [
    { symbol: "USAT", address: USAT },
    { symbol: "USDC", address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" },
    { symbol: "JPYm", address: "0xc45eCF20f3CD864B32D9794d6f76814aE8892e20" },
  ];
  const extra = "0x1111111111111111111111111111111111111111";
  const got = watchTokens(known, ["USAT"], [extra]);
  assert.ok(got.includes(USAT.toLowerCase()));
  assert.ok(got.includes(known[1].address.toLowerCase()));
  assert.ok(got.includes(extra));
  assert.ok(!got.includes(known[2].address.toLowerCase()));
});
