import hre from "hardhat";
import { concat, type Hex } from "viem";
import { toDataSuffix } from "@celo/attribution-tags";

// Deploys Earmark with the attribution tag appended; set AGENT_FEE_CURRENCY to pay gas in a stablecoin.
const feeCurrency = process.env.AGENT_FEE_CURRENCY || undefined;

async function main() {
  const tag = process.env.ATTRIBUTION_TAG;
  if (!tag) throw new Error("ATTRIBUTION_TAG missing; register on celobuilders.xyz first");
  const [wallet] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();
  const artifact = await hre.artifacts.readArtifact("Earmark");
  const data = concat([artifact.bytecode as Hex, toDataSuffix(tag)]);
  const hash = await wallet.sendTransaction({ data, ...(feeCurrency ? { feeCurrency } : {}) } as never);
  console.log(`deploy tx: https://celoscan.io/tx/${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`EARMARK_ADDRESS=${receipt.contractAddress}`);
  console.log(`verify: npx hardhat verify --network celo ${receipt.contractAddress}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
