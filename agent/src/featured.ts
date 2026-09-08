const DEAD = "0x000000000000000000000000000000000000dead";

export function isThrowawayDrive(d: { label: string; destination: string; closed?: boolean }) {
  if (d.destination.toLowerCase() === DEAD) return true;
  return /throwaway|wiring test/i.test(d.label);
}

/** Open, non-test drive. Reviewers must not land on /d/1 (closed 0xdead wiring test). */
export function pickFeatured<T extends { label: string; destination: string; closed: boolean }>(drives: T[]): T | null {
  const open = drives.filter((d) => !d.closed && !isThrowawayDrive(d));
  return open[0] ?? drives.find((d) => !d.closed) ?? null;
}
