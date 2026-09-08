import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installedVersion, loadSubmission, parseVersion, versionAtLeast } from "./cli.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("0.2.0 is the floor that actually funds", () => {
  assert.equal(versionAtLeast("0.1.1", "0.2.0"), false);
  assert.equal(versionAtLeast("0.2.0", "0.2.0"), true);
  assert.equal(versionAtLeast("0.2.1", "0.2.0"), true);
  assert.equal(parseVersion("nope"), null);
});

test("workspace pins a CLI that can --execute", () => {
  assert.equal(versionAtLeast(installedVersion(), "0.2.0"), true);
});

test("submission document is the live site, not the throwaway /d/1 drive", async () => {
  const doc = await loadSubmission(path.join(here, "submission.json"));
  assert.equal(doc.name, "Earmark");
  assert.equal(doc.budget, 10);
  assert.match(doc.propertyUrl, /^https:\/\/earmark-agent\.onrender\.com/);
  const q4 = doc.questions.find((q) => q.id === "q4");
  assert.ok(q4);
  assert.match(q4.text, /earmark-agent\.onrender\.com\/live/);
  assert.ok(doc.excludedBotWallets.includes("0x178977E82c4Df50D5a7465F4495170DFF9275363"));
});
