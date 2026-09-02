import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { chainId, env, explorerUrl, tokenByAddress } from "./config.js";
import { account, driveCount, readDrive, readTokenInfo } from "./chain.js";
import { db, getDrive, hasPlan, nextInstalment, paymentsFor, planCountFor, reconcileInstalments } from "./db.js";
import { memoName } from "./format.js";
import { x402Guard, x402Handler, x402Middleware } from "./x402.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, "../../web/dist");

export const app = express();
app.use(express.json());

// x402 must sit ahead of the SPA fallback so the 402 challenge is not swallowed by index.html.
app.use(x402Guard);
app.use(x402Middleware());
app.get("/x402/drive/:id", x402Handler);

app.get("/api/health", (_req, res) => res.json({ ok: true, agent: account.address, earmark: env.EARMARK_ADDRESS }));

app.get("/api/stats", async (_req, res) => {
  const payments = (db.prepare(`SELECT COUNT(*) AS n FROM payments`).get() as { n: number }).n;
  const payers = (db.prepare(`SELECT COUNT(DISTINCT payer) AS n FROM payments`).get() as { n: number }).n;
  const drives = env.EARMARK_ADDRESS
    ? Number(
        await driveCount().catch((e) => {
          console.error("driveCount:", (e as Error).message);
          return 0n;
        }),
      )
    : 0;
  res.json({ drives, payments, payers, agent: account.address, earmark: env.EARMARK_ADDRESS });
});

app.get("/api/drive/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Bad drive id." });
  try {
    const onchain = await readDrive(BigInt(id));
    if (onchain.destination === "0x0000000000000000000000000000000000000000") {
      return res.status(404).json({ error: "No such drive." });
    }
    const local = getDrive(id);
    const u = typeof req.query.u === "string" ? req.query.u : "";
    let you = null as null | { seq: number; count: number; paid: number; amount: string; dueAt: number };
    if (u && hasPlan(id)) {
      reconcileInstalments(id);
      const next = nextInstalment(id, u);
      const { total, paid } = planCountFor(id, u);
      if (next && total) you = { seq: next.seq, count: total, paid, amount: next.amount, dueAt: next.due_at };
    }
    res.json({
      you,
      id,
      label: onchain.label,
      token: tokenByAddress(onchain.token) ?? (await readTokenInfo(onchain.token)),
      destination: onchain.destination,
      collector: onchain.collector,
      target: onchain.target.toString(),
      raised: onchain.raised.toString(),
      deadline: Number(onchain.deadline),
      closed: onchain.closed,
      earmark: env.EARMARK_ADDRESS,
      tag: env.ATTRIBUTION_TAG,
      chainId,
      rpcUrl: env.CELO_RPC_URL,
      explorer: explorerUrl,
      chat: local ? { collectorName: local.collector_name } : null,
      payments: paymentsFor(id).map((p) => ({
        tx: p.tx_hash,
        payer: p.payer,
        name: memoName(p.memo, p.payer),
        amount: p.amount,
        block: p.block,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });
}

export function startServer() {
  return app.listen(env.PORT, () => console.log(`server on :${env.PORT} (${env.PUBLIC_URL})`));
}
