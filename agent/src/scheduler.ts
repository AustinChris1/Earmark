import { drivesWithPlans, dueInstalments, markNudged, reconcileInstalments, type DueInstalment } from "./db.js";
import { nudgeDue } from "./bot.js";

const TICK_MS = 10 * 60 * 1000;
const NUDGE_GAP_SEC = 20 * 3600;

// Posts a nudge when an instalment falls due, at most once per person per drive per NUDGE_GAP_SEC.
export function startScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const id of drivesWithPlans()) reconcileInstalments(id);
      const now = Math.floor(Date.now() / 1000);
      const due = dueInstalments(now, now - NUDGE_GAP_SEC);
      if (!due.length) return;

      const byDrive = new Map<number, DueInstalment[]>();
      for (const r of due) {
        const list = byDrive.get(r.drive_id) ?? [];
        list.push(r);
        byDrive.set(r.drive_id, list);
      }
      for (const [, rows] of byDrive) {
        // Mention only each person's earliest due instalment, but silence all of theirs that are due.
        const earliest = new Map<string, DueInstalment>();
        for (const r of rows) if (!earliest.has(r.tg_id)) earliest.set(r.tg_id, r);
        const sent = await nudgeDue([...earliest.values()]);
        if (sent) for (const r of rows) markNudged(r.drive_id, r.tg_id, r.seq, now);
      }
    } catch (e) {
      console.error("scheduler:", (e as Error).message);
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(tick, TICK_MS);
}
