import { Cencori } from "cencori";
import { getAddress, isAddress, parseUnits, type Address } from "viem";
import { env, TOKENS, tokenBySymbol, type TokenInfo } from "./config.js";

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

/**
 * Turns free text into drive fields. Every field is then checked back against the original
 * message: the model only locates values, it is never trusted to supply them. A hallucinated
 * destination would send money to a stranger permanently, since the address cannot be changed
 * once the drive is open.
 */
export async function parseDriveRequest(text: string): Promise<ParsedDrive | null> {
  const ai = client();
  if (!ai || text.trim().length < 8) return null;

  let raw: string;
  try {
    const res = await Promise.race([
      ai.ai.chat({
        model: env.CENCORI_MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: text },
        ],
        temperature: 0,
        maxTokens: 200,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    raw = (res as { content?: string }).content ?? "";
  } catch (e) {
    console.error("ai parse:", (e as Error).message);
    return null;
  }

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
  return !!env.CENCORI_API_KEY;
}

export const SUPPORTED_SYMBOLS = Object.keys(TOKENS);
