import "./setup-env.mts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeAbiParameters, encodeEventTopics, parseAbiItem, type Address, type Hex, type Log } from "viem";
import { deliveredTo } from "../src/textile.js";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const CNGN = "0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f" as Address;
const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as Address;
const AGENT = "0x178977E82c4Df50D5a7465F4495170DFF9275363" as Address;
const MAKER = "0x00000000000000000000000000000000000000aa" as Address;

const transfer = (token: Address, from: Address, to: Address, value: bigint) =>
  ({
    address: token,
    topics: encodeEventTopics({ abi: [TRANSFER], eventName: "Transfer", args: { from, to } }),
    data: encodeAbiParameters([{ type: "uint256" }], [value]) as Hex,
  }) as unknown as Log;

// Drive #10's swap, as it landed: USDT out to the maker and its fee, 2,000 cNGN in to the agent.
test("the coin a swap delivered is read from its receipt", () => {
  const logs = [
    transfer(USDT, AGENT, MAKER, 1_463_740n),
    transfer(USDT, AGENT, "0x00000000000000000000000000000000000000bb", 146n),
    transfer(CNGN, MAKER, AGENT, 2_000_000_000n),
  ];
  assert.equal(deliveredTo({ logs } as never, CNGN, AGENT), 2_000_000_000n);
  assert.equal(deliveredTo({ logs } as never, CNGN, MAKER), 0n);
});
