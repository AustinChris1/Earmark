import { randomBytes } from "node:crypto";
import type { RequestHandler } from "express";
import { getAddress, isAddress, verifyMessage, type Address } from "viem";
import { env } from "./config.js";
import { isVerifiedHuman } from "./chain.js";
import { getMeta, linkWallet, setMeta, walletFor } from "./db.js";

const NONCE_TTL_SEC = 15 * 60;

function nonceKey(tgId: string) {
  return `vn:${tgId}`;
}

export function linkMessage(tgId: string, nonce: string): string {
  return [
    "Earmark wallet link",
    "",
    `Telegram user: ${tgId}`,
    `Nonce: ${nonce}`,
    "",
    "Signing proves you control this wallet. It costs nothing and sends no transaction.",
  ].join("\n");
}

// A nonce, so a captured signature cannot be replayed to claim someone else's verified wallet.
export const nonceHandler: RequestHandler = async (req, res) => {
  const u = typeof req.query.u === "string" ? req.query.u : "";
  if (!/^\d{1,20}$/.test(u)) return res.status(400).json({ error: "Bad Telegram id." });
  const nonce = randomBytes(16).toString("hex");
  await setMeta(nonceKey(u), `${nonce}:${Math.floor(Date.now() / 1000) + NONCE_TTL_SEC}`);
  res.json({ nonce, message: linkMessage(u, nonce) });
};

export const linkHandler: RequestHandler = async (req, res) => {
  const { u, address, signature } = (req.body ?? {}) as { u?: string; address?: string; signature?: string };
  if (!u || !/^\d{1,20}$/.test(u)) return res.status(400).json({ error: "Bad Telegram id." });
  if (!address || !isAddress(address)) return res.status(400).json({ error: "Bad wallet address." });
  if (!signature) return res.status(400).json({ error: "Missing signature." });

  const stored = await getMeta(nonceKey(u));
  if (!stored) return res.status(400).json({ error: "Ask for a fresh link code and try again." });
  const [nonce, expiryRaw] = stored.split(":");
  if (Number(expiryRaw) < Math.floor(Date.now() / 1000)) {
    return res.status(400).json({ error: "That link code expired. Start again." });
  }

  const ok = await verifyMessage({
    address: getAddress(address),
    message: linkMessage(u, nonce),
    signature: signature as `0x${string}`,
  }).catch(() => false);
  if (!ok) return res.status(400).json({ error: "That signature does not match the wallet." });

  await setMeta(nonceKey(u), "");
  await linkWallet(u, getAddress(address));
  const verified = await isVerifiedHuman(getAddress(address)).catch(() => false);
  res.json({ ok: true, address: getAddress(address), verified });
};

export const statusHandler: RequestHandler = async (req, res) => {
  const u = typeof req.query.u === "string" ? req.query.u : "";
  if (!u) return res.status(400).json({ error: "Bad Telegram id." });
  const address = await walletFor(u);
  const verified = address ? await isVerifiedHuman(address as Address).catch(() => false) : false;
  res.json({
    linked: !!address,
    address: address ?? null,
    verified,
    // Empty means the gate is not configured, which the bot treats as "do not enforce".
    verifyUrl: env.SELF_VERIFY_URL,
    enforced: !!env.SELF_SBT_ADDRESS,
  });
};

// The bot's gate. With no SBT contract configured this stays open rather than locking everyone out.
export async function collectorIsHuman(tgId: string): Promise<{ allowed: boolean; address?: string }> {
  if (!env.SELF_SBT_ADDRESS) return { allowed: true };
  const address = await walletFor(tgId);
  if (!address) return { allowed: false };
  const verified = await isVerifiedHuman(address as Address).catch(() => false);
  return { allowed: verified, address };
}
