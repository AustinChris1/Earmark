/**
 * Drive codes: the short name a drive goes by in links and messages ("Kx7mQe" rather than "15").
 *
 * The contract numbers drives 1, 2, 3…, and that cannot change without a new contract. A code is
 * the same number run through a fixed 4-round Feistel permutation of 32 bits and written in base58
 * at a fixed six characters, so consecutive drives get unrelated-looking codes and every code maps
 * back to exactly one drive. Nothing is stored, and nothing is secret: drives are public on chain
 * anyway. This is about a link that reads like a name, not about hiding anything.
 *
 * The same file lives at web/src/lib/driveCode.ts; a test checks the two agree.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const LENGTH = 6; // 58^6 > 2^32, so every 32-bit id fits
const KEYS = [0x5a1f, 0x2c9b, 0x7e43, 0x1d6d];

function round(x: number, k: number): number {
  return ((x * 0x6f4b + k) ^ (x >>> 5) ^ (x << 3)) & 0xffff;
}

function permute(n: number): number {
  let l = n >>> 16;
  let r = n & 0xffff;
  for (const k of KEYS) [l, r] = [r, l ^ round(r, k)];
  return ((l << 16) | r) >>> 0;
}

function unpermute(n: number): number {
  let l = n >>> 16;
  let r = n & 0xffff;
  for (let i = KEYS.length - 1; i >= 0; i--) [l, r] = [r ^ round(l, KEYS[i]), l];
  return ((l << 16) | r) >>> 0;
}

/** The code for drive `id` (1 … 2^32-1). */
export function driveCode(id: number | bigint): string {
  let n = permute(Number(id) >>> 0);
  let s = "";
  for (let i = 0; i < LENGTH; i++) {
    s = ALPHABET[n % 58] + s;
    n = Math.floor(n / 58);
  }
  return s;
}

/** The drive a code names, or null if it is not a valid code. */
export function driveFromCode(code: string): number | null {
  if (code.length !== LENGTH) return null;
  let n = 0;
  for (const ch of code) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    n = n * 58 + v;
  }
  if (n > 0xffffffff) return null;
  const id = unpermute(n);
  return id > 0 ? id : null;
}

/**
 * What a link or a person typed means: a code, a plain drive number (links shared before codes
 * existed keep working), or a full URL ending in either. Null when it is neither.
 */
export function parseDriveRef(raw: string): number | null {
  // "#15" is how people write a drive number, so a leading # is not a URL fragment
  const s = raw.trim().replace(/^#/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  const last = s.slice(s.lastIndexOf("/") + 1);
  if (/^\d+$/.test(last)) {
    const n = Number(last);
    return n > 0 && n <= 0xffffffff ? n : null;
  }
  return driveFromCode(last);
}
