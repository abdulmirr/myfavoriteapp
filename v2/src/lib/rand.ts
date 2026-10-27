/** Deterministic hash of a string to [-1, 1] (FNV-1a based). */
export function hashRange(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const v = ((h >>> 0) % 2000) / 1000 - 1;
  return Math.abs(v) < 0.1 ? (v < 0 ? -0.1 : 0.1) : v;
}

/** Seeded pseudo-random in [0, 1). */
export function sr(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}
