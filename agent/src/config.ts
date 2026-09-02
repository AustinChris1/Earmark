import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Address, Hex } from "viem";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export type TokenInfo = {
  symbol: string;
  address: Address;
  decimals: number;
  feeCurrency: Address | null;
  // EIP-712 domain for EIP-3009 signing; version is derived from each token's on-chain DOMAIN_SEPARATOR.
  eip712?: { name: string; version: string };
};

// Celo mainnet; feeCurrency is the gas adapter (null = not a whitelisted gas token).
export const TOKENS: Record<string, TokenInfo> = {
  USDT: {
    symbol: "USDT",
    address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    decimals: 6,
    feeCurrency: "0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72",
    eip712: { name: "Tether USD", version: "1" },
  },
  USDC: {
    symbol: "USDC",
    address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    decimals: 6,
    feeCurrency: "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
    eip712: { name: "USDC", version: "2" },
  },
  USAT: {
    symbol: "USAT",
    address: "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771",
    decimals: 6,
    feeCurrency: "0x0357EE22278c922e1D36cFe6b899269b161880C4",
    eip712: { name: "Tether America USD", version: "1" },
  },
  cNGN: {
    symbol: "cNGN",
    address: "0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f",
    decimals: 6,
    feeCurrency: null,
  },
};

export function tokenByAddress(addr: string): TokenInfo | undefined {
  const a = addr.toLowerCase();
  return Object.values(TOKENS).find((t) => t.address.toLowerCase() === a);
}

export const env = {
  AGENT_PRIVATE_KEY: req("AGENT_PRIVATE_KEY") as Hex,
  CELO_RPC_URL: process.env.CELO_RPC_URL ?? "https://forno.celo.org",
  EARMARK_ADDRESS: (process.env.EARMARK_ADDRESS ?? "") as Address,
  ATTRIBUTION_TAG: process.env.ATTRIBUTION_TAG ?? "",
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? "",
  PUBLIC_URL: (process.env.PUBLIC_URL ?? "http://localhost:3010").replace(/\/$/, ""),
  PORT: Number(process.env.PORT ?? 3010),
  X402_API_KEY: process.env.X402_API_KEY ?? "",
  DB_PATH: process.env.DB_PATH ?? path.resolve(here, "../../earmark.db"),
  AGENT_NAME: process.env.AGENT_NAME ?? "Earmark",
  AGENT_FEE_CURRENCY: process.env.AGENT_FEE_CURRENCY ?? "",
  START_BLOCK: process.env.START_BLOCK ?? "",
};

export const ERC8004_IDENTITY_REGISTRY: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
export const CELO_CHAIN_ID = 42220;
export const LOCAL_CHAIN_ID = 31337;

// A localhost RPC means a Hardhat node, used for local end to end testing.
export const isLocal = /localhost|127\.0\.0\.1/.test(env.CELO_RPC_URL);
export const chainId = isLocal ? LOCAL_CHAIN_ID : CELO_CHAIN_ID;
export const X402_FACILITATOR = process.env.X402_FACILITATOR ?? "https://api.x402.celo.org";
export const X402_NETWORK = "eip155:42220" as const;

export const explorerUrl = isLocal ? "http://localhost:8545" : "https://celoscan.io";
