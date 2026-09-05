import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { celo } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { toDataSuffix } from "@celo/attribution-tags";
import { env, isLocal, LOCAL_CHAIN_ID } from "./config.js";

export const EARMARK_ABI = parseAbi([
  "struct Drive { address token; address destination; address collector; uint256 target; uint256 raised; uint64 deadline; bool closed; string label; }",
  "function createDrive(address token, address destination, uint256 target, uint64 deadline, string label) returns (uint256 id)",
  "function contribute(uint256 id, uint256 amount, string memo)",
  "function close(uint256 id)",
  "function drive(uint256 id) view returns (Drive)",
  "function driveCount() view returns (uint256)",
  "function contributionOf(uint256 id, address payer) view returns (uint256)",
  "event DriveCreated(uint256 indexed id, address indexed collector, address indexed destination, address token, uint256 target, uint64 deadline, string label)",
  "event Contributed(uint256 indexed id, address indexed payer, uint256 amount, uint256 raised, string memo)",
  "event DriveClosed(uint256 indexed id, uint256 raised)",
]);

export const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

export const chain = isLocal ? { ...celo, id: LOCAL_CHAIN_ID, name: "Hardhat" } : celo;
export const account = privateKeyToAccount(env.AGENT_PRIVATE_KEY);
export const publicClient = createPublicClient({ chain, transport: http(env.CELO_RPC_URL) });
export const walletClient = createWalletClient({ chain, account, transport: http(env.CELO_RPC_URL) });

// Every agent transaction carries the hackathon attribution tag.
export const tagSuffix: Hex | undefined = env.ATTRIBUTION_TAG ? toDataSuffix(env.ATTRIBUTION_TAG) : undefined;
// Gas token: set AGENT_FEE_CURRENCY to a fee adapter to pay gas in a stablecoin, otherwise gas is paid in CELO.
export const agentFeeCurrency: Address | undefined = env.AGENT_FEE_CURRENCY
  ? (env.AGENT_FEE_CURRENCY as Address)
  : undefined;

const tokenCache = new Map<string, { symbol: string; address: Address; decimals: number; feeCurrency: null }>();

// Falls back to reading ERC20 metadata for tokens outside the known list, such as a local test token.
export async function readTokenInfo(address: Address) {
  const key = address.toLowerCase();
  const hit = tokenCache.get(key);
  if (hit) return hit;
  const [symbol, decimals] = await Promise.all([
    publicClient.readContract({ address, abi: ERC20_ABI, functionName: "symbol" }),
    publicClient.readContract({ address, abi: ERC20_ABI, functionName: "decimals" }),
  ]);
  const info = { symbol, address, decimals: Number(decimals), feeCurrency: null as null };
  tokenCache.set(key, info);
  return info;
}

export function requireEarmark(): Address {
  if (!env.EARMARK_ADDRESS) throw new Error("EARMARK_ADDRESS not set; deploy the contract first");
  return env.EARMARK_ADDRESS;
}

export async function createDriveOnchain(args: {
  token: Address;
  destination: Address;
  target: bigint;
  deadline: bigint;
  label: string;
}): Promise<{ id: bigint; hash: Hex }> {
  const hash = await walletClient.writeContract({
    address: requireEarmark(),
    abi: EARMARK_ABI,
    functionName: "createDrive",
    args: [args.token, args.destination, args.target, args.deadline, args.label],
    dataSuffix: tagSuffix,
    feeCurrency: agentFeeCurrency,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const [log] = parseEventLogs({ abi: EARMARK_ABI, eventName: "DriveCreated", logs: receipt.logs });
  if (!log) throw new Error(`DriveCreated not found in ${hash}`);
  return { id: log.args.id, hash };
}

// Forwards value the agent received off-band (x402) into a drive, credited to `memo`.
export async function contributeFromAgent(id: bigint, token: Address, amount: bigint, memo: string): Promise<Hex> {
  const earmark = requireEarmark();
  const allowance = await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, earmark],
  });
  if (allowance < amount) {
    const approveHash = await walletClient.writeContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [earmark, amount],
      dataSuffix: tagSuffix,
      feeCurrency: agentFeeCurrency,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }
  const hash = await walletClient.writeContract({
    address: earmark,
    abi: EARMARK_ABI,
    functionName: "contribute",
    args: [id, amount, memo],
    dataSuffix: tagSuffix,
    feeCurrency: agentFeeCurrency,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function closeDriveOnchain(id: bigint): Promise<Hex> {
  const hash = await walletClient.writeContract({
    address: requireEarmark(),
    abi: EARMARK_ABI,
    functionName: "close",
    args: [id],
    dataSuffix: tagSuffix,
    feeCurrency: agentFeeCurrency,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// A wallet is a verified human when it holds Self's soulbound token for our flow.
export async function isVerifiedHuman(address: Address): Promise<boolean> {
  if (!env.SELF_SBT_ADDRESS) return false;
  const balance = await publicClient.readContract({
    address: env.SELF_SBT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });
  return balance > 0n;
}

export async function driveCount(): Promise<bigint> {
  return publicClient.readContract({ address: requireEarmark(), abi: EARMARK_ABI, functionName: "driveCount" });
}

// Reads the most recent drives straight from chain, newest first, so the dashboard needs no index.
export async function listDrives(limit = 100) {
  const count = Number(await driveCount());
  const ids: number[] = [];
  for (let i = count; i > 0 && ids.length < limit; i--) ids.push(i);
  const rows = await Promise.all(
    ids.map(async (id) => {
      const d = await readDrive(BigInt(id));
      return { id, ...d };
    }),
  );
  return rows.filter((d) => d.destination !== "0x0000000000000000000000000000000000000000");
}

export async function readDrive(id: bigint) {
  return publicClient.readContract({ address: requireEarmark(), abi: EARMARK_ABI, functionName: "drive", args: [id] });
}
