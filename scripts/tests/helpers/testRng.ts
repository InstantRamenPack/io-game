import seedrandom from "seedrandom";

export function makeTestRng(seed: string | number): seedrandom.PRNG {
  return seedrandom(String(seed));
}

export function rngFloat(
  rng: seedrandom.PRNG,
  minInclusive: number,
  maxExclusive: number,
): number {
  return minInclusive + rng() * (maxExclusive - minInclusive);
}

export function rngInt(
  rng: seedrandom.PRNG,
  minInclusive: number,
  maxInclusive: number,
): number {
  return Math.floor(rngFloat(rng, minInclusive, maxInclusive + 1));
}

export function rngBool(rng: seedrandom.PRNG, probability = 0.5): boolean {
  return rng() < probability;
}

export function rngPick<T>(rng: seedrandom.PRNG, values: readonly T[]): T {
  if (values.length === 0) {
    throw new Error("rngPick requires a non-empty array");
  }
  return values[rngInt(rng, 0, values.length - 1)]!;
}
