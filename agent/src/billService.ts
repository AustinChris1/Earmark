import type { Address } from "viem";
import { tokenBySymbol } from "./config.js";
import { account, ERC20_ABI, publicClient, readDrive, refundFromAgent } from "./chain.js";
import { payBill, PROVIDERS, type Bill } from "./abapay.js";
import { settleBill, type BillOutcome } from "./bills.js";
import { getBill, paymentsFor, setBillStatus, type BillRow } from "./db.js";

const USAT = tokenBySymbol("USAT")!;

export function billOf(row: BillRow): Bill {
  return {
    category: row.category as Bill["category"],
    serviceID: row.service_id,
    network: row.network,
    billersCode: row.billers_code,
    nairaAmount: row.naira_amount,
  };
}

export function providerLabel(row: Pick<BillRow, "service_id" | "category">): string {
  return Object.values(PROVIDERS).find((p) => p.serviceID === row.service_id)?.label ?? row.service_id;
}

// The bot registers how to tell a group what happened; kept as a callback so this file does not import the bot.
type Notify = (driveId: number, row: BillRow, outcome: BillOutcome) => Promise<void>;
let notify: Notify = async () => {};
export function onBillSettled(fn: Notify) {
  notify = fn;
}

// One bill at a time: two settling at once would read the same agent balance.
let queue: Promise<void> = Promise.resolve();

/** Called after every payment into a drive; pays the bill once the drive is full. */
export function maybeSettleBill(driveId: number) {
  queue = queue.then(async () => {
    const row = await getBill(driveId);
    if (!row || row.status !== "collecting") return;
    const d = await readDrive(BigInt(driveId));
    if (d.target === 0n || d.raised < d.target) return;
    const payments = (await paymentsFor(driveId)).map((p) => ({ payer: p.payer as Address, amount: BigInt(p.amount) }));
    try {
      const outcome = await settleBill(driveId, billOf(row), d.raised, payments, {
        agent: account.address,
        token: USAT.address,
        pay: (bill, max) => payBill(bill, "USAT", max),
        refund: (to, amount) => refundFromAgent(USAT.address, to, amount),
        balance: () =>
          publicClient.readContract({ address: USAT.address, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] }),
        setStatus: (id, status, fields) => setBillStatus(id, status, fields),
      });
      console.log(`bill drive ${driveId}: ${outcome.status}`);
      await notify(driveId, (await getBill(driveId))!, outcome).catch((e) => console.error("bill notify:", e));
    } catch (e) {
      console.error(`bill drive ${driveId}:`, (e as Error).message);
      await setBillStatus(driveId, "failed", { note: (e as Error).message });
    }
  });
  return queue;
}
