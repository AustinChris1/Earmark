/**
 * Opens a drive from the agent wallet without the bot, for scripted demos and tests.
 *
 *   pnpm --filter @earmark/agent open-drive <amount> <TOKEN> <destination> <label...>
 *
 * Same contract call the bot makes, tagged the same way. Prints the drive id.
 */
import { isAddress, getAddress, parseUnits } from "viem";
import { tokenBySymbol } from "../src/config.js";
import { createDriveOnchain } from "../src/chain.js";

const [amount, symbol, destination, ...labelParts] = process.argv.slice(2);
const label = labelParts.join(" ").trim();
const token = symbol ? tokenBySymbol(symbol) : undefined;
if (!amount || !token || !destination || !isAddress(destination) || !label) {
  console.error("usage: open-drive <amount> <TOKEN> <0xdestination> <label...>");
  process.exit(2);
}
const target = parseUnits(amount, token.decimals);
const { id, hash } = await createDriveOnchain(token.address, getAddress(destination), target, 0n, label);
console.log(`drive #${id} opened: ${amount} ${token.symbol} -> ${getAddress(destination)} "${label}"`);
console.log(`tx https://celoscan.io/tx/${hash}`);
process.exit(0);
