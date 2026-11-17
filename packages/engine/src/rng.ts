/**
 * Deterministic randomness. Every run of every path gets its own streams derived from
 * (seed, pathId, runIndex), so:
 *  - results are reproducible from the stored seed (share links, server vs browser),
 *  - re-running a single run (to capture its events) is exact,
 *  - changing one input keeps all other random draws identical ("common random numbers"),
 *    which keeps slider updates smooth and sensitivity analysis low-noise.
 */

export type Rng = () => number;

/** mulberry32: small, fast, good-quality 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string to an unsigned 32-bit integer. */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Combine integers into one well-mixed 32-bit seed (murmur3-style finalizer per part). */
export function mixSeed(...parts: number[]): number {
  let h = 0x9e3779b9 ^ parts.length;
  for (const part of parts) {
    h = Math.imul(h ^ (part >>> 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

export const STREAM_PARAMS = 1;
export const STREAM_EVENTS = 2;

export function runRng(seed: number, pathId: string, runIndex: number, stream: number): Rng {
  return mulberry32(mixSeed(seed, hashString(pathId), runIndex, stream));
}

/** Standard normal from two uniforms (Box–Muller). */
export function standardNormal(u1: number, u2: number): number {
  const r = Math.sqrt(-2 * Math.log(1 - u1)); // 1 - u1 is in (0, 1], so log is finite
  return r * Math.cos(2 * Math.PI * u2);
}

/** Pick a fresh random seed (for new simulations). */
export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0;
}
