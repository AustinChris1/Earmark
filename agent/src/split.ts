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
