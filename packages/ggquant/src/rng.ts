// ──────────────────────────────────────────────────────────────────────
// ggquant — Deterministic seeded PRNG (xoshiro128**)
// Ensures reproducible baselines and Monte Carlo shuffles.
// ──────────────────────────────────────────────────────────────────────

/** Deterministic PRNG. Same seed → identical sequence, every run. */
export class Rng {
  private s: Uint32Array;

  constructor(seed: number) {
    // SplitMix32 to expand seed into 4 state words
    this.s = new Uint32Array(4);
    let z = seed >>> 0;
    for (let i = 0; i < 4; i++) {
      z = (z + 0x9e3779b9) >>> 0;
      let t = z ^ (z >>> 16);
      t = Math.imul(t, 0x21f0aaad);
      t = t ^ (t >>> 15);
      t = Math.imul(t, 0x735a2d97);
      t = t ^ (t >>> 15);
      this.s[i] = t >>> 0;
    }
  }

  /** Returns a float in [0, 1). */
  next(): number {
    const s = this.s;
    const result = Math.imul(s[1]! * 5, 7) >>> 0;
    const t = (s[1]! << 9) >>> 0;

    s[2] = (s[2]! ^ s[0]!) >>> 0;
    s[3] = (s[3]! ^ s[1]!) >>> 0;
    s[1] = (s[1]! ^ s[2]!) >>> 0;
    s[0] = (s[0]! ^ s[3]!) >>> 0;
    s[2] = (s[2]! ^ t) >>> 0;
    s[3] = rotl(s[3]!, 11);

    return (result >>> 0) / 0x100000000;
  }

  /** Returns an integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Fisher-Yates shuffle (in-place, returns same array). */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
    return arr;
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}
