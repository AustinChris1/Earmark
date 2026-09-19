import express from "express";
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chainId, env, explorerUrl, publicRpcUrl, TOKENS, tokenByAddress } from "./config.js";
import { account, driveCount, listDrives, readDrive, readTokenInfo } from "./chain.js";
import { counts, getDrive, hasPlan, nextInstalment, paymentsFor, planCountFor, reconcileInstalments } from "./db.js";
import { memoName } from "./format.js";
import { x402Guard, x402Handler, x402Middleware } from "./x402.js";
import { linkHandler, nonceHandler, sessionHandler, statusHandler } from "./verify.js";
import { isTestDrive, pickFeatured } from "./featured.js";
import { drivePageHtml, homepageLiveSnippet, noLiveDriveHtml } from "./publicHtml.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, "../../web/dist");

export const app = express();
app.disable("x-powered-by");

// The theme script in index.html is inline; hashing it keeps the CSP strict without 'unsafe-inline' for scripts.
const inlineScriptHashes = (() => {
  const file = path.join(webDist, "index.html");
  if (!fs.existsSync(file)) return [];
  // The HTML parser normalises CRLF to LF before hashing, so the hash must be taken over the same bytes.
  const html = fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
  return [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`,
  );
})();

const csp = [
  "default-src 'self'",
  `script-src 'self' ${inlineScriptHashes.join(" ")}`.trim(),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  // Wallet RPC calls go to whichever public Celo node the page was told about.
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(express.json());

// x402 must sit ahead of the SPA fallback so the 402 challenge is not swallowed by index.html.
app.use(x402Guard);
app.use(x402Middleware());
app.get("/x402/drive/:id", x402Handler);

app.get("/api/verify/nonce", nonceHandler);
app.post("/api/verify/link", linkHandler);
app.get("/api/verify/status", statusHandler);
app.post("/api/verify/session", sessionHandler);

// Everything the browser needs to talk to the contract itself.
app.get("/api/config", (_req, res) =>
  res.json({
    earmark: env.EARMARK_ADDRESS,
    tag: env.ATTRIBUTION_TAG,
    chainId,
    rpcUrl: publicRpcUrl,
    explorer: explorerUrl,
    agent: account.address,
    tokens: TOKENS,
  }),
);

app.get("/api/drives", async (_req, res) => {
  try {
    const drives = await listDrives();
    res.json(
      drives.map((d) => ({
        id: d.id,
        label: d.label,
        token: tokenByAddress(d.token) ?? { symbol: "TOKEN", address: d.token, decimals: 18, feeCurrency: null },
        destination: d.destination,
        collector: d.collector,
        target: d.target.toString(),
        raised: d.raised.toString(),
        closed: d.closed,
        test: isTestDrive(d),
      })),
    );
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, agent: account.address, earmark: env.EARMARK_ADDRESS }));

function wantsHtml(req: { headers: { accept?: string } }) {
  const accept = String(req.headers.accept ?? "");
  if (accept.includes("application/json") && !accept.includes("text/html")) return false;
  return true;
}

function livePayload() {
  return listDrives().then((listed) => pickFeatured(listed));
}

// AskBots reviewers often do not run JavaScript. /live must be real HTML, not the SPA shell.
app.get("/live", async (req, res, next) => {
  if (!wantsHtml(req)) return next();
  try {
    const featured = env.EARMARK_ADDRESS ? await livePayload() : null;
    if (!featured) {
      res.type("html").send(noLiveDriveHtml());
      return;
    }
    const token = tokenByAddress(featured.token) ?? { symbol: "TOKEN", decimals: 18 };
    res.type("html").send(
      drivePageHtml({
        id: featured.id,
        label: featured.label,
        destination: featured.destination,
        collector: featured.collector,
        tokenSymbol: token.symbol,
        decimals: token.decimals,
        target: featured.target,
        raised: featured.raised,
        deadline: Number(featured.deadline),
        closed: featured.closed,
        explorer: explorerUrl,
      }),
    );
  } catch (e) {
    next(e);
  }
});

// AskBots round 2 fetched only the homepage, never /live. Put the live drive in the HTML of /.
app.get("/", async (req, res, next) => {
  if (!wantsHtml(req)) return next();
  const file = path.join(webDist, "index.html");
  if (!fs.existsSync(file)) return next();
  try {
    let html = fs.readFileSync(file, "utf8");
    const featured = env.EARMARK_ADDRESS ? await livePayload() : null;
    const token = featured ? (tokenByAddress(featured.token) ?? { symbol: "TOKEN", decimals: 18 }) : null;
    const snippet = homepageLiveSnippet(
      featured && token
        ? {
            id: featured.id,
            label: featured.label,
            destination: featured.destination,
            tokenSymbol: token.symbol,
            decimals: token.decimals,
            target: featured.target,
            raised: featured.raised,
            explorer: explorerUrl,
          }
        : null,
    );
    // Inside #root, so React replaces it on hydration; crawlers that never run JS still read it.
    // Outside #root it would sit unstyled under the app for everyone.
    html = html.replace("</main>", `${snippet}\n</main>`);
    res.type("html").send(html);
  } catch (e) {
    next(e);
  }
});

app.get("/api/stats", async (_req, res) => {
  const { payments, payers } = await counts();
  const listed = env.EARMARK_ADDRESS
    ? await listDrives().catch((e) => {
        console.error("listDrives:", (e as Error).message);
        return [];
      })
    : [];
  const featuredDrive = pickFeatured(listed);
  res.json({
    drives: listed.length,
    payments,
    payers,
    featured: featuredDrive ? { id: featuredDrive.id, label: featuredDrive.label } : null,
    agent: account.address,
    earmark: env.EARMARK_ADDRESS,
  });
});

app.get("/api/drive/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Bad drive id." });
  try {
    const onchain = await readDrive(BigInt(id));
    if (onchain.destination === "0x0000000000000000000000000000000000000000") {
      return res.status(404).json({ error: "No such drive." });
    }
    const local = await getDrive(id);
    const u = typeof req.query.u === "string" ? req.query.u : "";
    let you = null as null | { seq: number; count: number; paid: number; amount: string; dueAt: number };
    if (u && await hasPlan(id)) {
      await reconcileInstalments(id);
      const next = await nextInstalment(id, u);
      const { total, paid } = await planCountFor(id, u);
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
      rpcUrl: publicRpcUrl,
      explorer: explorerUrl,
      chat: local ? { collectorName: local.collector_name } : null,
      payments: (await paymentsFor(id)).map((p) => ({
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
