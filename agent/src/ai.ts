import { Cencori } from "cencori";
import { getAddress, isAddress, parseUnits, type Address } from "viem";
import { env, TOKENS, tokenBySymbol, type TokenInfo } from "./config.js";
import { buyEnabled, buyFetch, BuyUnavailable } from "./buy.js";

export type ParsedDrive = { amount: bigint; token: TokenInfo; destination: Address; label: string };

const TIMEOUT_MS = 12_000;

const SYSTEM = [
  "You turn one sentence into the fields of a group payment collection.",
  "Return only JSON: {\"amount\":string,\"token\":string,\"destination\":string,\"label\":string}.",
  "amount is the number the group must raise in total, digits only, no thousands separators.",
  "token is the ticker exactly as written by the user.",
  "destination is the 0x wallet address copied character for character from the message.",
  "label is a short description of what the money is for, at most eight words.",
  "Never invent an address. If the message has no 0x address, return {}.",
  "If anything is missing or ambiguous, return {}.",
].join(" ");

function client(): Cencori | null {
  if (!env.CENCORI_API_KEY) return null;
  return new Cencori({ apiKey: env.CENCORI_API_KEY });
}

type Message = { role: "system" | "user"; content: string };

/** Where the last reading came from, so the bot can say who read it and what Earmark paid. */
export type ReadBy = { via: "buy"; tx: string | null } | { via: "key" };

/** The text of an OpenAI-style chat completion, whichever shape the gateway returns. */
export function completionText(body: unknown): string {
  const b = body as { choices?: { message?: { content?: string } }[]; content?: string };
  return b?.choices?.[0]?.message?.content ?? b?.content ?? "";
}

/** Cencori through buy, paid per call from the agent wallet. Null when buy is off or fails. */
async function viaBuy(messages: Message[]): Promise<{ text: string; tx: string | null } | null> {
  if (!buyEnabled()) return null;
  try {
    const r = await buyFetch("cencori.chat", {
      method: "POST",
      body: JSON.stringify({ model: env.BUY_MODEL, messages, temperature: 0, max_tokens: 256 }),
      timeoutMs: TIMEOUT_MS + 8_000,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    let tx: string | null = null;
    try {
      tx = JSON.parse(Buffer.from(r.headers.get("x-payment-response") ?? r.headers.get("payment-response") ?? "", "base64").toString()).transaction ?? null;
    } catch {
      // The receipt header is optional; buy_calls keeps the settlement either way.
    }
    return { text: completionText(await r.json()), tx };
  } catch (e) {
    if (!(e instanceof BuyUnavailable)) console.error("ai via buy:", (e as Error).message);
    return null;
  }
}

/** Cencori with Earmark's own API key. */
async function viaKey(messages: Message[]): Promise<string | null> {
  const ai = client();
  if (!ai) return null;
  try {
    const res = await Promise.race([
      ai.ai.chat({ model: env.CENCORI_MODEL, messages, temperature: 0, maxTokens: 200 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    return (res as { content?: string }).content ?? "";
  } catch (e) {
    console.error("ai parse:", (e as Error).message);
    return null;
  }
}

/**
 * Turns free text into drive fields. Every field is then checked back against the original
 * message: the model only locates values, it is never trusted to supply them. A hallucinated
 * destination would send money to a stranger permanently, since the address cannot be changed
 * once the drive is open.
 *
 * The model is bought through buy first; if that is off, over budget or its answer does not
 * check out, Earmark's own Cencori key gets the same question.
 */
export async function parseDriveRequest(text: string): Promise<(ParsedDrive & { readBy: ReadBy }) | null> {
  if (text.trim().length < 8) return null;
  const messages: Message[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: text },
  ];
  const bought = await viaBuy(messages);
  if (bought) {
    const parsed = checkAgainst(text, bought.text);
    if (parsed) return { ...parsed, readBy: { via: "buy", tx: bought.tx } };
  }
  const raw = await viaKey(messages);
  if (raw === null) return null;
  const parsed = checkAgainst(text, raw);
  return parsed && { ...parsed, readBy: { via: "key" } };
}

/** Reads the model's JSON and keeps it only if every field is really in the user's message. */
function checkAgainst(text: string, raw: string): ParsedDrive | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: { amount?: string; token?: string; destination?: string; label?: string };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }

  return validateExtraction(text, parsed);
}

/**
 * Checks a model's extraction back against the message it came from. Exported so the guard
 * rails can be tested without calling a model.
 */
export function validateExtraction(
  text: string,
  parsed: { amount?: string; token?: string; destination?: string; label?: string },
): ParsedDrive | null {
  const { amount, token: symbol, destination, label } = parsed;
  if (!amount || !symbol || !destination || !label) return null;

  // The address must be present in what the user actually wrote, not merely well formed.
  if (!isAddress(destination) || !text.toLowerCase().includes(destination.toLowerCase())) return null;

  const token = tokenBySymbol(symbol);
  if (!token) return null;

  // The digits must appear in the message too, so a misread number cannot become a target.
  const digits = amount.replace(/[^\d.]/g, "");
  if (!digits || !text.replace(/,/g, "").includes(digits)) return null;

  let value: bigint;
  try {
    value = parseUnits(digits, token.decimals);
  } catch {
    return null;
  }
  if (value <= 0n) return null;

  return {
    amount: value,
    token,
    destination: getAddress(destination),
    label: label.trim().slice(0, 80),
  };
}

export function aiEnabled(): boolean {
  return !!env.CENCORI_API_KEY || buyEnabled();
}

export const SUPPORTED_SYMBOLS = Object.keys(TOKENS);
