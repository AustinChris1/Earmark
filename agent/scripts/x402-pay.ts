/**
 * Pays a share of an Earmark drive over x402, the way another agent would: no wallet UI, no human.
 *
 *   X402_PAYER_KEY=0x... pnpm --filter @earmark/agent x402:pay <driveId> <amount> [name]
 *
 * The payer signs an EIP-3009 authorisation for the drive's token; Celo's facilitator settles it to
 * the Earmark agent, and the agent forwards it into the drive with contribute(), so the money still
 * ends at the locked destination. The payer needs the token, and nothing else: gas is not its problem.
 */
import { privateKeyToAccount } from "viem/accounts";
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/client";

const [driveId, amount, name = "another agent"] = process.argv.slice(2);
const base = process.env.EARMARK_URL ?? "https://earmark-agent.onrender.com";
const key = process.env.X402_PAYER_KEY;

if (!driveId || !amount || !key) {
  console.error("usage: X402_PAYER_KEY=0x... x402-pay <driveId> <amount> [name]");
  process.exit(2);
}

const signer = privateKeyToAccount(key as `0x${string}`);
// The drive decides the token, so the client must accept whatever the 402 names; the amount was chosen above.
const client = registerExactEvmScheme(new x402Client().setSpendControls(false), { signer, networks: ["eip155:42220"] });
const http = new x402HTTPClient(client);

const url = `${base}/x402/drive/${driveId}?amt=${encodeURIComponent(amount)}&name=${encodeURIComponent(name)}`;
console.log(`payer ${signer.address}`);
console.log(`GET ${url}`);

const first = await fetch(url);
console.log(`-> ${first.status}`);
if (first.status !== 402) {
  console.log(await first.text());
  process.exit(first.ok ? 0 : 1);
}

const required = http.getPaymentRequiredResponse((h) => first.headers.get(h), await first.json().catch(() => undefined));
const offer = required.accepts[0];
console.log(`asked: ${offer.amount} base units of ${offer.asset} on ${offer.network}, payTo ${offer.payTo}`);

const payload = await http.createPaymentPayload(required);
const headers = http.encodePaymentSignatureHeader(payload);
console.log("signed; retrying with PAYMENT-SIGNATURE");

const paid = await fetch(url, { headers });
console.log(`-> ${paid.status}`);
const body = await paid.text();
console.log(body);
const settle = paid.headers.get("payment-response");
if (settle) console.log("settlement:", JSON.stringify(http.getPaymentSettleResponse((h) => paid.headers.get(h))));
process.exit(paid.ok ? 0 : 1);
