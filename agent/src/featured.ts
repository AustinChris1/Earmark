const DEAD = "0x000000000000000000000000000000000000dead";

export function isThrowawayDrive(d: { label: string; destination: string; closed?: boolean }) {
  if (d.destination.toLowerCase() === DEAD) return true;
  const label = d.label.trim();
  if (label.length < 8) return true;
  return /throwaway|wiring test|^os$|^test$|^tmp$/i.test(label);
}

/** Wiring tests only: the dashboard hides these but keeps short real labels like "Refund". */
export function isTestDrive(d: { label: string; destination: string }) {
  if (d.destination.toLowerCase() === DEAD) return true;
  return /throwaway|wiring test|^test$|^tmp$/i.test(d.label.trim());
}

/** Open, named obligation. Never the 0xdead wiring test or a two-letter label like "os". */
export function pickFeatured<T extends { label: string; destination: string; closed: boolean }>(drives: T[]): T | null {
  return drives.find((d) => !d.closed && !isThrowawayDrive(d)) ?? null;
}
