import "./setup-env.mts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { pastDeadline } from "../src/chain.js";

const now = Math.floor(Date.now() / 1000);

test("a drive past its deadline counts as closed; no deadline never expires", () => {
  assert.equal(pastDeadline({ deadline: BigInt(now - 60) }), true);
  assert.equal(pastDeadline({ deadline: BigInt(now + 3600) }), false);
  assert.equal(pastDeadline({ deadline: 0n }), false);
});
