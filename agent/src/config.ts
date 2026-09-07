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
// Every stablecoin Earmark accepts, verified on chain for symbol and decimals before being listed.
// feeCurrency is the gas adapter: Mento tokens are their own, USD tokens use an adapter, and the
// rest cannot pay gas. eip712 is only set where the domain was derived from the token's own
// DOMAIN_SEPARATOR, since x402 signing fails silently on a guessed version.
export const TOKENS: Record<string, TokenInfo> = {
  // Dollars
  USDT: { symbol: "USDT", address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", decimals: 6, feeCurrency: "0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72", eip712: { name: "Tether USD", version: "1" } },
  USDC: { symbol: "USDC", address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", decimals: 6, feeCurrency: "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B", eip712: { name: "USDC", version: "2" } },
  USAT: { symbol: "USAT", address: "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771", decimals: 6, feeCurrency: "0x0357EE22278c922e1D36cFe6b899269b161880C4", eip712: { name: "Tether America USD", version: "1" } },
  USDm: { symbol: "USDm", address: "0x765DE816845861e75A25fCA122bb6898B8B1282a", decimals: 18, feeCurrency: "0x765DE816845861e75A25fCA122bb6898B8B1282a" },

  // Naira, both issuers
  cNGN: { symbol: "cNGN", address: "0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f", decimals: 6, feeCurrency: null },
  NGNm: { symbol: "NGNm", address: "0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71", decimals: 18, feeCurrency: "0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71" },

  // Mento local currencies
  KESm: { symbol: "KESm", address: "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0", decimals: 18, feeCurrency: "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0" },
  GHSm: { symbol: "GHSm", address: "0xfAeA5F3404bbA20D3cc2f8C4B0A888F55a3c7313", decimals: 18, feeCurrency: "0xfAeA5F3404bbA20D3cc2f8C4B0A888F55a3c7313" },
  ZARm: { symbol: "ZARm", address: "0x4c35853A3B4e647fD266f4de678dCc8fEC410BF6", decimals: 18, feeCurrency: "0x4c35853A3B4e647fD266f4de678dCc8fEC410BF6" },
  XOFm: { symbol: "XOFm", address: "0x73F93dcc49cB8A239e2032663e9475dd5ef29A08", decimals: 18, feeCurrency: "0x73F93dcc49cB8A239e2032663e9475dd5ef29A08" },
  EURm: { symbol: "EURm", address: "0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73", decimals: 18, feeCurrency: "0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73" },
  BRLm: { symbol: "BRLm", address: "0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787", decimals: 18, feeCurrency: "0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787" },
  COPm: { symbol: "COPm", address: "0x8A567e2aE79CA692Bd748aB832081C45de4041eA", decimals: 18, feeCurrency: "0x8A567e2aE79CA692Bd748aB832081C45de4041eA" },
  PHPm: { symbol: "PHPm", address: "0x105d4A9306D2E55a71d2Eb95B81553AE1dC20d7B", decimals: 18, feeCurrency: "0x105d4A9306D2E55a71d2Eb95B81553AE1dC20d7B" },
  GBPm: { symbol: "GBPm", address: "0xCCF663b1fF11028f0b19058d0f7B674004a40746", decimals: 18, feeCurrency: "0xCCF663b1fF11028f0b19058d0f7B674004a40746" },
  CHFm: { symbol: "CHFm", address: "0xb55a79F398E759E43C95b979163f30eC87Ee131D", decimals: 18, feeCurrency: "0xb55a79F398E759E43C95b979163f30eC87Ee131D" },
  JPYm: { symbol: "JPYm", address: "0xc45eCF20f3CD864B32D9794d6f76814aE8892e20", decimals: 18, feeCurrency: "0xc45eCF20f3CD864B32D9794d6f76814aE8892e20" },
  AUDm: { symbol: "AUDm", address: "0x7175504C455076F15c04A2F90a8e352281F492F9", decimals: 18, feeCurrency: "0x7175504C455076F15c04A2F90a8e352281F492F9" },
  CADm: { symbol: "CADm", address: "0xff4Ab19391af240c311c54200a492233052B6325", decimals: 18, feeCurrency: "0xff4Ab19391af240c311c54200a492233052B6325" },

  // Ripio wFIAT, Latin America
  wARS: { symbol: "wARS", address: "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D", decimals: 18, feeCurrency: null },
  wBRL: { symbol: "wBRL", address: "0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0", decimals: 18, feeCurrency: null },
  wMXN: { symbol: "wMXN", address: "0x337E7456B420bD3481e7FA61fA9850343d610d34", decimals: 18, feeCurrency: null },
  wCOP: { symbol: "wCOP", address: "0x8a1D45e102e886510e891d2Ec656a708991e2D76", decimals: 18, feeCurrency: null },
  wPEN: { symbol: "wPEN", address: "0x4F34c8b3b5FB6D98Da888F0feA543d4d9C9F2eBE", decimals: 18, feeCurrency: null },
  wCLP: { symbol: "wCLP", address: "0x61D450a098b6a7f69fC4b98CE68198fe59768651", decimals: 18, feeCurrency: null },
};

// Symbols are matched case insensitively: people type "cngn", not "cNGN".
export function tokenBySymbol(symbol: string): TokenInfo | undefined {
  const k = symbol.trim().toLowerCase();
  return Object.values(TOKENS).find((t) => t.symbol.toLowerCase() === k);
}

export function tokenByAddress(addr: string): TokenInfo | undefined {
  const a = addr.toLowerCase();
  return Object.values(TOKENS).find((t) => t.address.toLowerCase() === a);
}

export const env = {
  AGENT_PRIVATE_KEY: req("AGENT_PRIVATE_KEY") as Hex,
  CELO_RPC_URL: process.env.CELO_RPC_URL ?? "https://forno.celo.org",
  // A second endpoint the agent falls back to. Keeps the watcher alive if the primary blinks.
  CELO_RPC_FALLBACK: process.env.CELO_RPC_FALLBACK ?? "https://forno.celo.org",
  EARMARK_ADDRESS: (process.env.EARMARK_ADDRESS ?? "") as Address,
  ATTRIBUTION_TAG: process.env.ATTRIBUTION_TAG ?? "",
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? "",
  PUBLIC_URL: (process.env.PUBLIC_URL ?? "http://localhost:3010").replace(/\/$/, ""),
  PORT: Number(process.env.PORT ?? 3010),
  X402_API_KEY: process.env.X402_API_KEY ?? "",
  DB_PATH: process.env.DB_PATH ?? path.resolve(here, "../../earmark.db"),
  // Turso in production; a local file when DATABASE_URL is unset. The host filesystem is ephemeral.
  DATABASE_URL:
    process.env.DATABASE_URL ??
    `file:${(process.env.DB_PATH ?? path.resolve(here, "../../earmark.db")).split(path.sep).join("/")}`,
  DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN ?? "",
  AGENT_NAME: process.env.AGENT_NAME ?? "Earmark",
  AGENT_FEE_CURRENCY: process.env.AGENT_FEE_CURRENCY ?? "",
  START_BLOCK: process.env.START_BLOCK ?? "",
  // Self Enterprise mints a soulbound token per verified human; balanceOf >= 1 is the whole check.
  SELF_SBT_ADDRESS: (process.env.SELF_SBT_ADDRESS ?? "") as Address,
  // Self Enterprise: a session is created per user, so there is no static verification link.
  SELF_API_KEY: process.env.SELF_API_KEY ?? "",
  SELF_FLOW_ID: process.env.SELF_FLOW_ID ?? "",
  SELF_API_BASE: process.env.SELF_API_BASE ?? "https://edge.dashboard.self.xyz",
  // Optional. Without a key the bot simply keeps using its guided prompts.
  CENCORI_API_KEY: process.env.CENCORI_API_KEY ?? "",
  CENCORI_MODEL: process.env.CENCORI_MODEL ?? "gpt-4o",
};

export const ERC8004_IDENTITY_REGISTRY: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
export const CELO_CHAIN_ID = 42220;
export const LOCAL_CHAIN_ID = 31337;

// A localhost RPC means a Hardhat node, used for local end to end testing.
export const isLocal = /localhost|127\.0\.0\.1/.test(env.CELO_RPC_URL);
export const chainId = isLocal ? LOCAL_CHAIN_ID : CELO_CHAIN_ID;
export const X402_FACILITATOR = process.env.X402_FACILITATOR ?? "https://api.x402.celo.org";
export const X402_NETWORK = "eip155:42220" as const;

// Never hand a keyed RPC URL to a browser: a Chainstack endpoint carries its credential in the
// path, so the public one is what /api/config serves.
export const publicRpcUrl = isLocal
  ? env.CELO_RPC_URL
  : (process.env.PUBLIC_RPC_URL ?? "https://forno.celo.org");

export const explorerUrl = isLocal ? "http://localhost:8545" : "https://celoscan.io";
