/**
 * Proves the Textile path without moving money: previews a price, then asks for a firm quote with
 * the agent as taker (which exercises the signed taker proof) and cancels it straight away.
 *
 *   pnpm --filter @earmark/agent textile:quote <amount> <SELL> <BUY>
 *   e.g. textile:quote 2 USDT cNGN
 */
import { formatUnits, parseUnits } from "viem";
import { tokenBySymbol } from "../src/config.js";
import { account } from "../src/chain.js";
import { cancel, preview, requestFirm } from "../src/textile.js";

const [amount = "2", sellSym = "USDT", buySym = "cNGN"] = process.argv.slice(2);
const sell = tokenBySymbol(sellSym);
const buy = tokenBySymbol(buySym);
if (!sell || !buy) {
  console.error(`unknown token: ${!sell ? sellSym : buySym}`);
  process.exit(2);
}
const sellAmount = parseUnits(amount, sell.decimals);
const fmt = (v: bigint, d: number, s: string) => `${Number(formatUnits(v, d)).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${s}`;

const p = await preview(sell.address, buy.address, { sellAmount });
console.log(`preview: ${fmt(p.takerPays, sell.decimals, sell.symbol)} -> ${fmt(p.buyAmount, buy.decimals, buy.symbol)} (fee ${fmt(p.feeAmount, sell.decimals, sell.symbol)})`);

console.log(`firm quote, taker ${account.address} ...`);
const q = await requestFirm(sell.address, buy.address, { sellAmount });
console.log(`firm:    ${fmt(q.takerPays, sell.decimals, sell.symbol)} -> ${fmt(q.buyAmount, buy.decimals, buy.symbol)}, expires ${q.expiresAt.toISOString()}`);
console.log(`spender ${q.spender}, swap to ${q.swap.to}, ${q.swap.data.length / 2 - 1} bytes of calldata`);
await cancel(q);
console.log("cancelled; nothing was sent on chain");
process.exit(0);
