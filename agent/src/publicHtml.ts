import { formatUnits } from "viem";

const CONTRACT = "0x93316de31b4f891c56cf3b65a3f96aa6b04192ae";
const SOURCE = "https://repo.sourcify.dev/42220/0x93316DE31b4f891C56cf3b65A3f96AA6b04192Ae";
const ORIGIN = "https://earmark-agent.onrender.com";

export function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function fmtToken(amount: bigint | string, decimals: number, symbol: string) {
  const n = Number(formatUnits(BigInt(amount), decimals));
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${symbol}`;
}

export function shell(opts: { title: string; canonical: string; body: string }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
  <meta name="description" content="Earmark collects a named group bill in chat and can only pay the locked destination. No withdraw, no treasurer." />
  <link rel="canonical" href="${escapeHtml(opts.canonical)}" />
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1.25rem; line-height: 1.5; color: #111; }
    h1 { font-size: 1.75rem; line-height: 1.2; }
    .muted { color: #444; }
    .lock { background: #e8f5e4; padding: 1rem; border-radius: 0.75rem; }
    a { color: #476520; }
    code { font-size: 0.9em; }
  </style>
</head>
<body>
${opts.body}
</body>
</html>`;
}

export function productHomeHtml() {
  return shell({
    title: "Earmark: group bills that can only pay the locked destination",
    canonical: `${ORIGIN}/`,
    body: `
<h1>Earmark: money that carries its destination</h1>
<p>A family or house names one bill in Telegram (school fees, rent, a shared meter). The agent can only send funds to the wallet locked when the drive opened. Nothing stops at a treasurer.</p>
<p>Example: <code>/new 450 USDT 0xSchool Term 1 fees for Chioma</code></p>
<h2>Sent to a person vs earmarked</h2>
<p>Sent to a person: the transfer succeeds, the school is still unpaid. Earmarked: every share lands at the locked destination in the same transaction. The contract has createDrive, contribute and close. There is no withdraw function and no admin key.</p>
<p>Contract <a href="https://celoscan.io/address/${CONTRACT}">${CONTRACT}</a> on Celo. Source <a href="${SOURCE}">verified on Sourcify</a>. Telegram <a href="https://t.me/Earmarked_bot">@Earmarked_bot</a>.</p>
<p><a href="/live">Open the live drive</a> (not /d/1, which is a closed wiring test).</p>`,
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
}) {
  const target = BigInt(d.target);
  const raised = BigInt(d.raised);
  const remaining = target > 0n && target > raised ? target - raised : 0n;
  const when =
    d.deadline > 0
      ? `Closes ${new Date(d.deadline * 1000).toISOString().slice(0, 16)} UTC`
      : "Open until the collector closes it";
  const title = `${d.label} - Earmark drive #${d.id}`;
  return shell({
    title,
    canonical: `${ORIGIN}/live`,
    body: `
<h1>${escapeHtml(d.label)}</h1>
<p class="muted">This is the live Earmark drive (#${d.id} on Celo). You are paying this named obligation, not a person in the middle.</p>
<div class="lock">
  <p><strong>Pays only to this address</strong> (locked when the drive opened):</p>
  <p><a href="${d.explorer}/address/${d.destination}"><code>${d.destination}</code></a></p>
  <p>After you confirm, tokens leave your wallet and arrive at that address in the same transaction. The Earmark contract never holds the money. There is no withdraw function.</p>
</div>
<ul>
  <li>Token: ${escapeHtml(d.tokenSymbol)} on Celo</li>
  <li>Raised: ${fmtToken(raised, d.decimals, d.tokenSymbol)}${target > 0n ? ` of ${fmtToken(target, d.decimals, d.tokenSymbol)}` : ""}</li>
  ${target > 0n ? `<li>Still needed: ${fmtToken(remaining, d.decimals, d.tokenSymbol)}</li>` : ""}
  <li>Status: ${d.closed ? "closed" : "open"} · ${when}</li>
  <li>Collector (opened the drive): <a href="${d.explorer}/address/${d.collector}"><code>${d.collector}</code></a></li>
  <li>Router contract (not the payee): <a href="${d.explorer}/address/${CONTRACT}"><code>${CONTRACT}</code></a> · <a href="${SOURCE}">Sourcify exact match</a></li>
</ul>
<p><a href="/d/${d.id}">Pay this drive in MiniPay</a> · <a href="${ORIGIN}/">What Earmark is</a></p>
<p class="muted">Drive #1 is a closed wiring test to 0xdead. Do not pay it.</p>`,
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
</section>`;
}

export function noLiveDriveHtml() {
  return shell({
    title: "No named live drive - Earmark",
    canonical: `${ORIGIN}/live`,
    body: `
<h1>No named live drive yet</h1>
<p>Open one in Telegram with a real label, for example <code>/new 5 USDT 0xPayee Term 1 fees for Chioma</code>. Short labels like "os" are hidden from this page on purpose.</p>
<p><a href="${ORIGIN}/">What Earmark is</a></p>`,
  });
}
