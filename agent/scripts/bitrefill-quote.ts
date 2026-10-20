/**
 * What Bitrefill would charge for a top-up, and what the account can pay with.
 * Reads only: this never buys anything.
 *
 *   pnpm -F @earmark/agent bitrefill:quote NG            list operators in a country
 *   pnpm -F @earmark/agent bitrefill:quote mtn-nigeria 100   price a top-up
 */
import { balance, enabled, operators, quote } from "../src/bitrefill.js";

const [arg, value] = process.argv.slice(2);
if (!enabled()) {
  console.error("BITREFILL_API_KEY is not set in .env");
  process.exit(1);
}

const b = await balance().catch((e) => ({ balance: NaN, currency: (e as Error).message }));
console.log(`account balance: ${b.balance} ${b.currency}\n`);

if (!arg) {
  console.log("usage: bitrefill:quote <COUNTRY> | bitrefill:quote <operator-id> <value>");
  process.exit(0);
}

if (!value) {
  const list = await operators(arg);
  console.log(`${list.length} phone top-up operators in ${arg.toUpperCase()}:`);
  for (const o of list) {
    const packs = o.packages.slice(0, 4).map((k) => `${k.label}→${k.price}`).join(" ");
    console.log(`  ${o.id.padEnd(28)} ${o.currency}  ${o.range ? `${o.range.min}-${o.range.max}` : "packages only"}  ${packs}`);
  }
} else {
  const q = await quote(arg, Number(value));
  // price is in the account's billing currency, so a margin only means something when it matches
  const sameCurrency = q.operator.rate !== null && q.operator.rate < 2;
  const margin = sameCurrency && q.price < q.value ? `  (${(((q.value - q.price) / q.value) * 100).toFixed(1)}% below face value)` : "";
  console.log(`${q.operator.name}`);
  console.log(`  the phone gets : ${q.value} ${q.currency}  ${q.label !== String(q.value) ? `(${q.label})` : ""}`);
  console.log(`  you are charged: ${q.price} in the account's billing currency${margin}`);
  console.log(`  package        : ${q.packageId ?? "free amount"}`);
}
