/**
 * Divides a target evenly in the token's base units. Integer division leaves a remainder of up to
 * n-1 units; those go one each to the first members so the shares still add up to the target exactly.
 */
export function evenSplit(total: bigint, n: number): bigint[] {
  if (n <= 0) return [];
  const base = total / BigInt(n);
  const remainder = Number(total % BigInt(n));
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1n : 0n));
}

/**
 * How many equal shares a drive is divided into. People in the chat who have not spoken yet still
 * hold a slot, so the one person the bot has heard from is not handed the whole pot.
 * `humansInChat` is null when the chat size could not be read.
 */
export function splitSlots(heard: number, humansInChat: number | null): number {
  if (heard <= 0) return 0;
  if (humansInChat == null || humansInChat < 1) return heard;
  return Math.max(heard, humansInChat);
}
