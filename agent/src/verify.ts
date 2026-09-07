import { createHash, randomBytes } from "node:crypto";
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
    canVerify: selfConfigured(),
    enforced: !!env.SELF_SBT_ADDRESS,
  });
};

export function selfConfigured(): boolean {
  return !!env.SELF_API_KEY && !!env.SELF_FLOW_ID;
}

// A stable, non identifying id per Telegram user, so the Self dashboard shows one row per person.
function externalUuid(tgId: string): string {
  const h = createHash("sha256").update(`earmark:${tgId}`).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// Self issues a one time verification URL per session, so there is nothing static to link to.
export const sessionHandler: RequestHandler = async (req, res) => {
  const u = typeof req.body?.u === "string" ? req.body.u : "";
  if (!/^\d{1,20}$/.test(u)) return res.status(400).json({ error: "Bad Telegram id." });
  if (!selfConfigured()) return res.status(503).json({ error: "Verification is not configured yet." });

  try {
    const r = await fetch(`${env.SELF_API_BASE}/v1/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.SELF_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ flowId: env.SELF_FLOW_ID, externalUuid: externalUuid(u) }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await r.json().catch(() => ({}))) as {
      verificationUrl?: string;
      id?: string;
      error?: { message?: string };
    };
    if (!r.ok || !body.verificationUrl) {
      return res.status(502).json({ error: body.error?.message ?? "Self did not return a session." });
    }
    res.json({ url: body.verificationUrl, id: body.id });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
};

// The bot's gate. With no SBT contract configured this stays open rather than locking everyone out.
export async function collectorIsHuman(tgId: string): Promise<{ allowed: boolean; address?: string }> {
  if (!env.SELF_SBT_ADDRESS) return { allowed: true };
  const address = await walletFor(tgId);
  if (!address) return { allowed: false };
  const verified = await isVerifiedHuman(address as Address).catch(() => false);
  return { allowed: verified, address };
}
