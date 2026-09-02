import { parseAbi, parseEventLogs } from "viem";
import { account, publicClient, walletClient, agentFeeCurrency, tagSuffix } from "./chain.js";
import { env, ERC8004_IDENTITY_REGISTRY, CELO_CHAIN_ID } from "./config.js";

// Registers the agent in the ERC-8004 Identity Registry on Celo mainnet and prints the 8004scan URL.
const REGISTRY_ABI = parseAbi([
  "function register(string agentURI) returns (uint256)",
  "function setAgentURI(uint256 agentId, string newURI)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

const registration = {
  type: "Agent",
  name: env.AGENT_NAME,
  description:
    "Earmark pools a group obligation (school fees, a shared meter, rent) from a family or house chat and can only pay the locked destination. Nothing is ever custodied. Runs on Celo with cNGN, USDT and USAT over x402.",
  image: `${env.PUBLIC_URL}/icon.svg`,
  endpoints: [
    { type: "web", url: env.PUBLIC_URL },
    { type: "x402", url: `${env.PUBLIC_URL}/x402` },
    { type: "wallet", address: account.address, chainId: CELO_CHAIN_ID },
  ],
  x402Support: true,
  active: true,
  supportedTrust: ["reputation"],
};

const agentURI = `data:application/json;base64,${Buffer.from(JSON.stringify(registration)).toString("base64")}`;

async function main() {
  const existing = process.env.ERC8004_AGENT_ID;
  if (existing) {
    const hash = await walletClient.writeContract({
      address: ERC8004_IDENTITY_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "setAgentURI",
      args: [BigInt(existing), agentURI],
      dataSuffix: tagSuffix,
      feeCurrency: agentFeeCurrency,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`Updated agentURI for agent ${existing}: ${hash}`);
    return;
  }
  const hash = await walletClient.writeContract({
    address: ERC8004_IDENTITY_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "register",
    args: [agentURI],
    dataSuffix: tagSuffix,
    feeCurrency: agentFeeCurrency,
  });
  console.log(`register tx: https://celoscan.io/tx/${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const [log] = parseEventLogs({ abi: REGISTRY_ABI, eventName: "Transfer", logs: receipt.logs });
  if (!log) throw new Error("Transfer event not found; registration may have failed");
  const agentId = log.args.tokenId;
  console.log(`ERC8004_AGENT_ID=${agentId}`);
  console.log(`8004scan: https://8004scan.io/agents/celo/${agentId}`);
  console.log(`celoscan: https://celoscan.io/nft/${ERC8004_IDENTITY_REGISTRY}/${agentId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
