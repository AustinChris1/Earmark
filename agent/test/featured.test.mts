import assert from "node:assert/strict";
import { test } from "node:test";
import { isThrowawayDrive, pickFeatured } from "../src/featured.js";

const dead = "0x000000000000000000000000000000000000dEaD";
const live = "0xd6dba363d1A45e2Bad96b94C1235F20D22A80216";

test("the closed wiring test is a throwaway", () => {
  assert.equal(isThrowawayDrive({ label: "x402 wiring test (throwaway)", destination: dead }), true);
});

test("reviewers are sent to an open drive, never /d/1", () => {
  const featured = pickFeatured([
    { id: 2, label: "Term 1 fees", destination: live, closed: false },
    { id: 1, label: "x402 wiring test (throwaway)", destination: dead, closed: true },
  ]);
  assert.ok(featured);
  assert.equal(featured.id, 2);
});

test("an open real drive beats a closed throwaway even when the throwaway is first", () => {
  const featured = pickFeatured([
    { id: 1, label: "x402 wiring test (throwaway)", destination: dead, closed: true },
    { id: 2, label: "os", destination: live, closed: false },
  ]);
  assert.equal(featured?.id, 2);
});
