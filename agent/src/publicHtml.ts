import { formatUnits } from "viem";

const CONTRACT = "0x93316de31b4f891c56cf3b65a3f96aa6b04192ae";
const SOURCE = "https://repo.sourcify.dev/42220/0x93316DE31b4f891C56cf3b65A3f96AA6b04192Ae";
const ORIGIN = "https://earmark-agent.onrender.com";

// The same mark as web/src/brand/Logo.tsx: a notch cut into an ear.
const MARK =
  '<svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M16.5 4.5C21 5 23.6 8 23 11.5L16.6 12.4L22.6 17.4C21.5 21 17.5 24 14 28C10 26 6 21 5.5 15C5 9 10 4 16.5 4.5Z"/>' +
  '<path d="M11.8 20C10.5 18 10.6 14.8 12.3 13.3C13.8 12 16 12.2 17 13.9"/></svg>';

export function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export type Receipt = { tx: string; payer: string; amount: bigint | string; name?: string };

/** The proof reviewers keep asking for: real transfers, each one a Celoscan link with From and To. */
function receiptsHtml(receipts: Receipt[] | undefined, decimals: number, symbol: string, explorer: string) {
  if (!receipts || receipts.length === 0) return "";
  const rows = receipts
    .slice(-5)
    .reverse()
    .map(
      (r) =>
        `<li>${fmtToken(r.amount, decimals, symbol)} from <code>${r.payer.slice(0, 6)}…${r.payer.slice(-4)}</code>${
          r.name ? ` (${escapeHtml(r.name)})` : ""
        }, <a href="${explorer}/tx/${r.tx}">transaction ${r.tx.slice(0, 10)}…</a></li>`,
    )
    .join("\n");
  return `<h2>Payments so far</h2>
<p class="muted">Each one is a single transaction from the payer straight to the locked address. Open it on Celoscan: the token transfer's To is the payee, never this contract.</p>
<ul class="receipts">
${rows}
</ul>`;
}

export function fmtToken(amount: bigint | string, decimals: number, symbol: string) {
  const n = Number(formatUnits(BigInt(amount), decimals));
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${symbol}`;
}

/**
 * Server-rendered pages share the site's palette and type, in both colour schemes, so a reader
 * who lands here without JavaScript (or a crawler) sees the same product as the app. No script,
 * so nothing here depends on the CSP hash computed for index.html.
 */
export function shell(opts: { title: string; canonical: string; body: string }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
  <meta name="description" content="Earmark collects a named group bill in chat and can only pay the locked destination. No withdraw, no treasurer." />
  <link rel="canonical" href="${escapeHtml(opts.canonical)}" />
  <link rel="icon" href="/icon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Space+Grotesk:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root { --bg:#ffffff; --raised:#ffffff; --sunken:#f7f7f2; --line:#e4e4d8; --text:#0a0a08; --muted:#5b5b52; --brand:#fcff52; --brand-ink:#0a0a08; --accent:#476520; --accent-soft:#eef3e4; }
    @media (prefers-color-scheme: dark) {
      :root { --bg:#0a0a08; --raised:#141410; --sunken:#000000; --line:#2a2a22; --text:#f7f7f2; --muted:#9d9d90; --accent:#56df7c; --accent-soft:#16251a; }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; }
    body { background: var(--bg); color: var(--text); font-family: "Space Grotesk", ui-sans-serif, system-ui, sans-serif; line-height: 1.55; -webkit-font-smoothing: antialiased; }
    a { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
    ::selection { background: var(--brand); color: var(--brand-ink); }
    .wrap { max-width: 42rem; margin: 0 auto; padding: 0 1.25rem 4rem; }
    header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 0; }
    .word { display: inline-flex; align-items: center; gap: .6rem; color: var(--text); text-decoration: none; font-family: "Instrument Serif", ui-serif, Georgia, serif; font-size: 1.6rem; line-height: 1; }
    .word svg { color: var(--accent); }
    nav a { color: var(--muted); text-decoration: none; font-size: .9rem; font-weight: 500; margin-left: 1rem; }
    .card { background: var(--raised); border: 1px solid var(--line); border-radius: 1rem; padding: 1.5rem; margin-top: 1.5rem; }
    h1 { font-family: "Instrument Serif", ui-serif, Georgia, serif; font-weight: 400; font-size: 2rem; line-height: 1.15; letter-spacing: -0.01em; margin: 0; }
    h2 { font-family: "Instrument Serif", ui-serif, Georgia, serif; font-weight: 400; font-size: 1.5rem; margin: 2rem 0 .5rem; }
    .muted { color: var(--muted); }
    .meta { margin: .4rem 0 0; font-size: .9rem; color: var(--muted); }
    .lock { background: var(--accent-soft); border-radius: .75rem; padding: 1rem; margin-top: 1.25rem; }
    .lock strong { color: var(--accent); font-size: .85rem; }
    .lock code { display: block; margin: .35rem 0; font-size: .8rem; word-break: break-all; color: var(--text); }
    .lock p { margin: .5rem 0 0; font-size: .9rem; color: var(--muted); }
    .bar { height: .6rem; background: var(--line); border-radius: 999px; overflow: hidden; margin-top: 1.25rem; }
    .bar > span { display: block; height: 100%; background: var(--accent); border-radius: 999px; }
    .amounts { display: flex; justify-content: space-between; font-size: .95rem; margin-top: .5rem; font-variant-numeric: tabular-nums; }
    .actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1.5rem; }
    .btn { display: inline-flex; align-items: center; padding: .8rem 1.25rem; border-radius: .75rem; font-weight: 600; font-size: .95rem; text-decoration: none; }
    .btn.primary { background: var(--brand); color: var(--brand-ink); }
    .btn.quiet { border: 1px solid var(--line); color: var(--text); }
    dl { margin: 1.5rem 0 0; font-size: .9rem; }
    dl div { display: grid; grid-template-columns: 9rem 1fr; gap: .75rem; padding: .55rem 0; border-top: 1px solid var(--line); }
    dt { color: var(--muted); }
    dd { margin: 0; word-break: break-all; }
    .receipts { margin: .5rem 0 0; padding-left: 1.1rem; font-size: .9rem; }
    .receipts li { margin: .3rem 0; }
    code { font-size: .85em; }
    p { margin: .75rem 0 0; }
    footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--line); font-size: .85rem; color: var(--muted); }
    @media (max-width: 480px) { dl div { grid-template-columns: 1fr; gap: .1rem; } .card { padding: 1.25rem; } }
  </style>
</head>
<body>
<div class="wrap">
  <header>
    <a class="word" href="${ORIGIN}/">${MARK}<span>Earmark</span></a>
    <nav><a href="${ORIGIN}/app">Drives</a><a href="${ORIGIN}/docs">Docs</a></nav>
  </header>
${opts.body}
  <footer>Earmark routes every contribution to the locked destination in the same transaction. The contract never holds a balance. Built on Celo.</footer>
</div>
</body>
</html>`;
}

export function productHomeHtml() {
  return shell({
    title: "Earmark: group bills that can only pay the locked destination",
    canonical: `${ORIGIN}/`,
    body: `
<div class="card">
<h1>Earmark: money that carries its destination</h1>
<p class="muted">A family or house names one bill in Telegram (school fees, rent, a shared meter). The agent can only send funds to the wallet locked when the drive opened. Nothing stops at a treasurer.</p>
<p>Example: <code>/new 450 USDT 0xSchool Term 1 fees for Chioma</code></p>
<h2>Sent to a person vs earmarked</h2>
<p>Sent to a person: the transfer succeeds, the school is still unpaid. Earmarked: every share lands at the locked destination in the same transaction. The contract has createDrive, contribute and close. There is no withdraw function and no admin key.</p>
<p>Contract <a href="https://celoscan.io/address/${CONTRACT}">${CONTRACT}</a> on Celo. Source <a href="${SOURCE}">verified on Sourcify</a>. Telegram <a href="https://t.me/Earmarked_bot">@Earmarked_bot</a>.</p>
<div class="actions"><a class="btn primary" href="/live">Open the live drive</a></div>
</div>`,
  });
}

export function drivePageHtml(d: {
  id: number;
  label: string;
  destination: string;
  collector: string;
  tokenSymbol: string;
  decimals: number;
  target: bigint | string;
  raised: bigint | string;
  deadline: number;
  closed: boolean;
  explorer: string;
  receipts?: Receipt[];
}) {
  const target = BigInt(d.target);
  const raised = BigInt(d.raised);
  const remaining = target > 0n && target > raised ? target - raised : 0n;
  const pct = target > 0n ? Math.min(100, Number((raised * 1000n) / target) / 10) : 0;
  const when =
    d.deadline > 0
      ? `closes ${new Date(d.deadline * 1000).toISOString().slice(0, 10)}`
      : "until the collector closes it";
  const status = target > 0n && raised >= target ? "Paid in full" : d.closed ? "Closed" : `Open, ${when}`;
  const title = `${d.label} - Earmark drive #${d.id}`;
  return shell({
    title,
    canonical: `${ORIGIN}/live`,
    body: `
<div class="card">
<h1>${escapeHtml(d.label)}</h1>
<p class="meta">Drive #${d.id} on Celo. You are paying this named obligation, not a person in the middle.</p>
<div class="lock">
  <strong>Pays only to this address</strong>
  <code>${d.destination}</code>
  <p>Locked when the drive opened. After you confirm, tokens leave your wallet and arrive at that address in the same transaction. The Earmark contract never holds the money. There is no withdraw function.</p>
</div>
${
  target > 0n
    ? `<div class="bar"><span style="width:${pct}%"></span></div>
<div class="amounts"><strong>${fmtToken(raised, d.decimals, d.tokenSymbol)}</strong><span class="muted">of ${fmtToken(target, d.decimals, d.tokenSymbol)}</span></div>`
    : ""
}
<div class="actions">
  ${d.closed ? "" : `<a class="btn primary" href="/d/${d.id}">Pay this drive</a>`}
  <a class="btn quiet" href="${d.explorer}/address/${d.destination}">Payee on Celoscan</a>
</div>
${receiptsHtml(d.receipts, d.decimals, d.tokenSymbol, d.explorer)}
<dl>
  <div><dt>Token</dt><dd>${escapeHtml(d.tokenSymbol)} on Celo</dd></div>
  ${target > 0n ? `<div><dt>Still needed</dt><dd>${fmtToken(remaining, d.decimals, d.tokenSymbol)}</dd></div>` : ""}
  <div><dt>Status</dt><dd>${status}</dd></div>
  <div><dt>Opened by</dt><dd><a href="${d.explorer}/address/${d.collector}"><code>${d.collector}</code></a></dd></div>
  <div><dt>Router contract</dt><dd><a href="${d.explorer}/address/${CONTRACT}"><code>${CONTRACT}</code></a>, <a href="${SOURCE}">source verified</a>. Not the payee.</dd></div>
</dl>
</div>
<p class="muted" style="font-size:.85rem">Drive #1 is a closed wiring test to 0xdead. Do not pay it. <a href="${ORIGIN}/">What Earmark is</a>.</p>`,
  });
}

/** Injected into the SPA homepage so AskBots crawlers that never leave / still see the live drive. */
export function homepageLiveSnippet(d: {
  id: number;
  label: string;
  destination: string;
  tokenSymbol: string;
  decimals: number;
  target: bigint | string;
  raised: bigint | string;
  explorer: string;
  receipts?: Receipt[];
} | null) {
  if (!d) {
    return `<section id="live-drive"><h2>Live drive</h2><p>No named open drive yet. Open one in Telegram, then see <a href="/live">/live</a>.</p></section>`;
  }
  const target = BigInt(d.target);
  const raised = BigInt(d.raised);
  return `<section id="live-drive">
<h2>Live drive: ${escapeHtml(d.label)}</h2>
<p>Drive #${d.id} on Celo. You are paying this named obligation, not a person in the middle.</p>
<p><strong>Pays only to</strong> <a href="${d.explorer}/address/${d.destination}"><code>${d.destination}</code></a></p>
<p>Token ${escapeHtml(d.tokenSymbol)}. Raised ${fmtToken(raised, d.decimals, d.tokenSymbol)}${target > 0n ? ` of ${fmtToken(target, d.decimals, d.tokenSymbol)}` : ""}. After you pay, tokens leave your wallet and arrive at that address in the same transaction. Full page: <a href="/live">/live</a>. Pay: <a href="/d/${d.id}">/d/${d.id}</a>.</p>
${receiptsHtml(d.receipts, d.decimals, d.tokenSymbol, d.explorer)}
</section>`;
}

export function noLiveDriveHtml() {
  return shell({
    title: "No named live drive - Earmark",
    canonical: `${ORIGIN}/live`,
    body: `
<div class="card">
<h1>No named live drive yet</h1>
<p class="muted">Open one in Telegram with a real label, for example <code>/new 5 USDT 0xPayee Term 1 fees for Chioma</code>. Short labels like "os" are hidden from this page on purpose.</p>
<div class="actions"><a class="btn primary" href="${ORIGIN}/">What Earmark is</a></div>
</div>`,
  });
}
