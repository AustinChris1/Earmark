import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { driveCode, driveFromCode, parseDriveRef } from "../src/driveCode.js";
import * as web from "../../web/src/lib/driveCode.js";

test("every drive id round-trips through its code", () => {
  for (let id = 1; id <= 200_000; id++) assert.equal(driveFromCode(driveCode(id)), id);
  for (const id of [2 ** 31, 2 ** 32 - 1, 123_456_789]) assert.equal(driveFromCode(driveCode(id)), id);
});

test("codes are six characters and consecutive drives look unrelated", () => {
  const codes = [1, 2, 3, 4, 5].map(driveCode);
  for (const c of codes) assert.match(c, /^[1-9A-HJ-NP-Za-km-z]{6}$/);
  assert.equal(new Set(codes).size, 5);
  // no shared prefix run like 000001, 000002
  assert.ok(new Set(codes.map((c) => c.slice(0, 3))).size >= 4, codes.join(" "));
});

test("a link, a code or an old number all find the drive", () => {
  const c = driveCode(15);
  assert.equal(parseDriveRef(c), 15);
  assert.equal(parseDriveRef(`https://earmark-agent.onrender.com/d/${c}?u=1&n=Ada`), 15);
  assert.equal(parseDriveRef("https://earmark-agent.onrender.com/d/15"), 15);
  assert.equal(parseDriveRef("#15"), 15);
  assert.equal(parseDriveRef("15"), 15);
  assert.equal(parseDriveRef("hello"), null);
  assert.equal(parseDriveRef("0"), null);
  assert.equal(parseDriveRef("zzzzzz"), null); // decodes past 2^32
});

test("the website's copy is the same algorithm", () => {
  for (const id of [1, 2, 15, 999, 65_536, 4_000_000_000]) assert.equal(web.driveCode(id), driveCode(id));
  const strip = (s: string) => s.replace(/\s+/g, "");
  const a = readFileSync(new URL("../src/driveCode.ts", import.meta.url), "utf8");
  const b = readFileSync(new URL("../../web/src/lib/driveCode.ts", import.meta.url), "utf8");
  assert.equal(strip(a), strip(b), "web/src/lib/driveCode.ts drifted from agent/src/driveCode.ts");
});
