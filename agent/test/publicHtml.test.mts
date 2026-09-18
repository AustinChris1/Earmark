import assert from "node:assert/strict";
import { test } from "node:test";
import { drivePageHtml, escapeHtml, homepageLiveSnippet, noLiveDriveHtml } from "../src/publicHtml.js";

test("drive HTML names the obligation and the locked payee without JavaScript", () => {
  const html = drivePageHtml({
    id: 3,
    label: "Term 1 fees for Chioma",
    destination: "0xd6dba363d1A45e2Bad96b94C1235F20D22A80216",
    collector: "0x178977E82c4Df50D5a7465F4495170DFF9275363",
    tokenSymbol: "cNGN",
    decimals: 6,
    target: 5_000_000n,
    raised: 0n,
    deadline: 0,
    closed: false,
    explorer: "https://celoscan.io",
  });
  assert.match(html, /<h1>Term 1 fees for Chioma<\/h1>/);
  assert.match(html, /0xd6dba363d1A45e2Bad96b94C1235F20D22A80216/);
  assert.match(html, /same transaction/);
  assert.match(html, /no withdraw/i);
  assert.doesNotMatch(html, />os</);
});

test("labels are escaped", () => {
  assert.equal(escapeHtml(`a <b> "x"`), "a &lt;b&gt; &quot;x&quot;");
});

test("empty featured drive tells the reviewer to open a named one", () => {
  assert.match(noLiveDriveHtml(), /No named live drive/);
});

test("homepage snippet names the live drive for crawlers that never leave /", () => {
  const html = homepageLiveSnippet({
    id: 3,
    label: "Term 1 fees for Chioma",
    destination: "0x909e4e085Ea683194b8611b721b94EF9DE1e45cA",
    tokenSymbol: "cNGN",
    decimals: 6,
    target: 5_000_000n,
    raised: 0n,
    explorer: "https://celoscan.io",
  });
  assert.match(html, /Term 1 fees for Chioma/);
  assert.match(html, /0x909e4e085Ea683194b8611b721b94EF9DE1e45cA/);
  assert.match(html, /\/live/);
});
