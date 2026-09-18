import { createPublicClient, createWalletClient, custom, defineChain, getAddress, http, type Address } from "viem";

export type Config = {
  earmark: Address;
  tag: string;
  chainId: number;
  rpcUrl: string;
  explorer: string;
  agent: Address;
  tokens: Record<string, { symbol: string; address: Address; decimals: number; feeCurrency: Address | null }>;
};

declare global {
  interface Window {
    ethereum?: {
      isMiniPay?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

export function chainFor(cfg: Config) {
  return defineChain({
    id: cfg.chainId,
    name: cfg.chainId === 42220 ? "Celo" : "Local",
    nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  });
}

export function publicFor(cfg: Config) {
  return createPublicClient({ chain: chainFor(cfg), transport: http(cfg.rpcUrl) });
}

export async function connect(cfg: Config): Promise<Address> {
  if (!window.ethereum) {
    throw new Error("No wallet found. Open this in MiniPay, or install a Celo compatible wallet.");
  }
  const [raw] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
  await ensureChain(cfg);
  return getAddress(raw);
}

/**
 * MetaMask, Rabby and friends start on whatever network the user last used. viem refuses to send
 * from a client whose chain differs from the wallet's, so switch first, adding Celo if it is missing.
 * MiniPay is Celo only and does not implement these methods, so it is left alone.
 */
export async function ensureChain(target: { chainId: number; rpcUrl: string; explorer?: string }): Promise<void> {
  const eth = window.ethereum;
  if (!eth || eth.isMiniPay) return;
  const wanted = `0x${target.chainId.toString(16)}`;
  const current = (await eth.request({ method: "eth_chainId" }).catch(() => null)) as string | null;
  if (current && current.toLowerCase() === wanted) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: wanted }] });
  } catch (e) {
    const err = e as { code?: number; message?: string };
    const unknownChain = err.code === 4902 || /4902|unrecognized|not (been )?added/i.test(err.message ?? "");
    if (!unknownChain) throw new Error("Switch your wallet to Celo and try again.");
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: wanted,
          chainName: target.chainId === 42220 ? "Celo" : "Local",
          nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
          rpcUrls: [target.rpcUrl],
          ...(target.explorer ? { blockExplorerUrls: [target.explorer] } : {}),
        },
      ],
    });
  }
}

// MiniPay injects an already connected account, so the dashboard can skip the connect step there.
export async function silentAccount(): Promise<Address | null> {
  if (!window.ethereum) return null;
  try {
    const accounts = (await window.ethereum.request({ method: "eth_accounts" })) as string[];
    return accounts?.[0] ? getAddress(accounts[0]) : null;
  } catch {
    return null;
  }
}

export function walletFor(cfg: Config, account: Address) {
  if (!window.ethereum) throw new Error("No wallet found.");
  return createWalletClient({ chain: chainFor(cfg), account, transport: custom(window.ethereum) });
}
