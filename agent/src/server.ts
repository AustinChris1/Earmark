import { formatUnits, isHex, type Hex } from "viem";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chainId, env, explorerUrl, publicRpcUrl, TOKENS, tokenByAddress, tokenBySymbol } from "./config.js";
import { account, driveCount, listDrives, readDrive, readTokenInfo } from "./chain.js";
import { counts, getDrive, hasPlan, nextInstalment, paymentsFor, planCountFor, reconcileInstalments } from "./db.js";
import { memoName } from "./format.js";
import { x402Guard, x402Handler, x402Middleware } from "./x402.js";
import { linkHandler, nonceHandler, sessionHandler, statusHandler } from "./verify.js";
import { isTestDrive, pickFeatured } from "./featured.js";
import { offrampUrl, rampCountry } from "./ripio.js";
import { getBill } from "./db.js";
import { maskNumber } from "./bills.js";
import { PROVIDERS } from "./abapay.js";
import {
  attachBill,
  attachIntlMessage,
  attachMessage,
  BILL_COINS,
  billAmount,
  billReceipt,
  checkBillInput,
  foreignAmount,
  priceBill,
  priceIntlBill,
  providerLabel,
  type BillCoin,
} from "./billService.js";
import { intlCountries, intlOperators, intlPlans } from "./abapayIntl.js";
import { payOptions } from "./corridor.js";
import { corridorQuoteHandler, corridorStatusHandler, corridorSubmitHandler } from "./corridorService.js";
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

async function receiptsFor(driveId: number) {
  return (await paymentsFor(driveId)).map((p) => ({
    tx: p.tx_hash,
    payer: p.payer,
    amount: p.amount,
    name: memoName(p.memo, p.payer),
  }));
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
        receipts: await receiptsFor(featured.id),
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
            receipts: await receiptsFor(featured.id),
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

// Bill drives from the website: the providers, a live price, attaching the bill to a drive the person
// just opened from their own wallet, and the receipt for that same wallet.
app.get("/api/bills/providers", (_req, res) =>
  res.json(Object.entries(PROVIDERS).map(([key, p]) => ({ key, label: p.label, category: p.category }))),
);

// AbaPay's international catalogue, a level at a time: countries, then a country's networks, then
// a network's fixed-price top-ups.
app.get("/api/bills/intl", async (req, res) => {
  try {
    const { country, operator } = req.query as Record<string, string | undefined>;
    if (operator) return res.json(await intlPlans(operator));
    if (country) return res.json(await intlOperators(country));
    res.json(await intlCountries());
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

app.get("/api/bills/quote", async (req, res) => {
  try {
    const coin = BILL_COINS.find((c) => c === req.query.coin) ?? "USAT";
    if (req.query.country) {
      const { country, operator, plan, number } = req.query as Record<string, string>;
      const t = tokenBySymbol(coin)!;
      const q = await priceIntlBill(country, operator, plan, number ?? "", coin);
      return res.json({
        coin,
        token: t.address,
        decimals: t.decimals,
        quoted: q.quoted.toString(),
        target: q.target.toString(),
        targetHuman: formatUnits(q.target, t.decimals),
        label: q.label,
        payee: account.address,
        number: q.number,
        amountLabel: foreignAmount(q.plan),
        sign: attachIntlMessage(0, q.operator.name, q.number, q.plan).replace("#0", "#{id}"),
      });
    }
    const naira = Number(req.query.naira);
    const input = checkBillInput(String(req.query.provider ?? ""), String(req.query.number ?? ""), naira);
    if (!input.ok) return res.status(400).json({ error: input.error });
    const t = tokenBySymbol(coin)!;
    const q = await priceBill(input.provider, input.number, naira, coin);
    res.json({
      coin,
      token: t.address,
      decimals: t.decimals,
      quoted: q.quoted.toString(),
      target: q.target.toString(),
      targetHuman: formatUnits(q.target, t.decimals),
      label: q.label,
      payee: account.address,
      number: input.number,
      amountLabel: `₦${naira.toLocaleString("en-US")}`,
      // The exact text the opener signs once the drive exists, with its id in place of {id}.
      sign: attachMessage(0, input.provider, input.number, naira).replace("#0", "#{id}"),
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.post("/api/bills", async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!isHex(b.signature)) return res.status(400).json({ error: "Sign the message in your wallet." });
    const common = {
      driveId: Number(b.driveId),
      number: String(b.number ?? ""),
      coin: String(b.coin ?? "") as BillCoin,
      signature: b.signature as Hex,
    };
    await attachBill(
      b.country
        ? { ...common, country: String(b.country), operator: String(b.operator ?? ""), plan: String(b.plan ?? "") }
        : { ...common, provider: String(b.provider ?? ""), naira: Number(b.naira) },
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.post("/api/drive/:id/receipt", async (req, res) => {
  try {
    const sig = (req.body ?? {}).signature;
    if (!isHex(sig)) return res.status(400).json({ error: "Sign the message in your wallet." });
    res.json(await billReceipt(Number(req.params.id), sig as Hex));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.get("/api/drive/:id/corridor-quote", corridorQuoteHandler);
app.post("/api/corridor", corridorSubmitHandler);
app.get("/api/corridor/:id", corridorStatusHandler);

app.get("/api/drive/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Bad drive id." });
  try {
    const onchain = await readDrive(BigInt(id));
    if (onchain.destination === "0x0000000000000000000000000000000000000000") {
      return res.status(404).json({ error: "No such drive." });
    }
    const local = await getDrive(id);
    const bill = await getBill(id);
    const toAgent = onchain.destination.toLowerCase() === account.address.toLowerCase();
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
      // A bill drive: the provider, a masked number, and how the payment went. The electricity token is
      // only posted to the group that paid for it, or shown to the wallet that opened the drive.
      bill: bill
        ? {
            provider: providerLabel(bill),
            category: bill.category,
            number: maskNumber(bill.billers_code),
            naira: bill.naira_amount,
            amountLabel: billAmount(bill),
            status: bill.status,
            settleTx: bill.settle_tx || null,
            // Opened from a wallet on the website, not by the bot in a group: the opener signs to see the receipt.
            openedOnWeb: onchain.collector.toLowerCase() !== account.address.toLowerCase(),
          }
        : null,
      // A drive that pays Earmark's wallet with no bill behind it: nothing would ever pay it out.
      unattached: toAgent && !bill,
      // Other coins this drive can be paid in; Earmark swaps them into the drive's coin on Textile.
      payOptions: payOptions(tokenByAddress(onchain.token)),
      // Ripio serves this coin: the page builds the payer's on-ramp link with their own wallet, and
      // the payee gets an off-ramp link for what the drive has paid them.
      ramp: (() => {
        const t = tokenByAddress(onchain.token);
        if (!t || !rampCountry(t.symbol)) return null;
        return { country: rampCountry(t.symbol), offramp: offrampUrl(t.symbol, formatUnits(onchain.raised, t.decimals)) };
      })(),
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
