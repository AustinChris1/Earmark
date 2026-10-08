/**
 * Prices a bill through AbaPay without paying it, and checks the coin is the one asked for.
 *
 *   pnpm --filter @earmark/agent abapay:quote <provider> <number> <naira> [USAT|USDT]
 *   e.g. abapay:quote ikeja 45000000000 5000 USAT
 */
import { formatUnits } from "viem";
import { PROVIDERS, quoteBill } from "../src/abapay.js";

const [provider = "mtn", number = "08012345678", naira = "1000", coin = "USAT"] = process.argv.slice(2);
const p = PROVIDERS[provider.toLowerCase()];
if (!p) {
  console.error(`unknown provider; one of: ${Object.keys(PROVIDERS).join(", ")}`);
  process.exit(2);
}
const q = await quoteBill(
  { category: p.category, serviceID: p.serviceID, network: p.network, billersCode: number, nairaAmount: Number(naira) },
  coin.toUpperCase() as "USAT" | "USDT",
);
console.log(`${p.label}, ${number}, N${Number(naira).toLocaleString("en-US")}: ${formatUnits(q.amount, 6)} ${coin.toUpperCase()} (asset ${q.asset}), paid to ${q.payTo}`);
process.exit(0);
