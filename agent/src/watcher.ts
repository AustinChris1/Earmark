import { EARMARK_ABI, publicClient, requireEarmark } from "./chain.js";
import { env, isLocal } from "./config.js";
import { getDrive, getMeta, insertPayment, markClosed, reconcileInstalments, setMeta } from "./db.js";
import { memoName } from "./format.js";
import { announceContribution } from "./bot.js";

const CHUNK = 2000n;
const POLL_MS = 12_000;

// Scans Contributed / DriveClosed logs from the last seen block and announces new ones in the drive's chat.
export function startWatcher(startBlock?: bigint) {
  const configured = env.START_BLOCK ? BigInt(env.START_BLOCK) : startBlock;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const earmark = requireEarmark();
      const head = await publicClient.getBlockNumber();
      const base = configured ?? (isLocal ? 0n : head - 1n);
      let from = BigInt(getMeta("last_block") ?? (base - 1n < 0n ? -1n : base - 1n).toString()) + 1n;
      while (from <= head) {
        const to = from + CHUNK - 1n < head ? from + CHUNK - 1n : head;
        const contributed = await publicClient.getContractEvents({
          address: earmark,
          abi: EARMARK_ABI,
          eventName: "Contributed",
          fromBlock: from,
          toBlock: to,
        });
        for (const log of contributed) {
          const { id, payer, amount, memo } = log.args;
          if (id === undefined || payer === undefined || amount === undefined) continue;
          const driveId = Number(id);
          const note = memo ?? "";
          const isNew = insertPayment({
            tx_hash: log.transactionHash,
            drive_id: driveId,
            payer,
            amount: amount.toString(),
            memo: note,
            block: Number(log.blockNumber),
          });
          if (isNew) reconcileInstalments(driveId);
          if (isNew && getDrive(driveId)) {
            await announceContribution(driveId, memoName(note, payer), amount, log.transactionHash).catch(console.error);
          }
        }
        const closed = await publicClient.getContractEvents({
          address: earmark,
          abi: EARMARK_ABI,
          eventName: "DriveClosed",
          fromBlock: from,
          toBlock: to,
        });
        for (const log of closed) {
          if (log.args.id !== undefined) markClosed(Number(log.args.id));
        }
        setMeta("last_block", to.toString());
        from = to + 1n;
      }
    } catch (e) {
      console.error("watcher:", (e as Error).message);
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(tick, POLL_MS);
}
