const MASK64 = (1n << 64n) - 1n;
const PCG_MULT = 6364136223846793005n;

/**
 * PCG32 — small, fast, statistically solid, and fully deterministic.
 * The engine's ONLY source of randomness. Never use Math.random().
 */
export class Pcg32 {
  private state: bigint;
  private readonly inc: bigint;

  constructor(seed: bigint | number, streamId: bigint | number = 54n) {
    this.inc = (((BigInt(streamId) & MASK64) << 1n) | 1n) & MASK64;
    this.state = 0n;
    this.nextU32();
    this.state = (this.state + (BigInt(seed) & MASK64)) & MASK64;
    this.nextU32();
  }

  nextU32(): number {
    const old = this.state;
    this.state = (old * PCG_MULT + this.inc) & MASK64;
    const xorshifted = Number((((old >> 18n) ^ old) >> 27n) & 0xffffffffn);
    const rot = Number(old >> 59n);
    return ((xorshifted >>> rot) | (xorshifted << (-rot & 31))) >>> 0;
  }

  /** Uniform in the open interval (0, 1) — never exactly 0 or 1. */
  next(): number {
    return (this.nextU32() + 0.5) / 4294967296;
  }
}

/** splitmix64 — derives independent per-replication seeds from the master seed. */
export function splitmix64(x: bigint): bigint {
  x = (x + 0x9e3779b97f4a7c15n) & MASK64;
  let z = x;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
  return (z ^ (z >> 31n)) & MASK64;
}

export function deriveReplicationSeed(masterSeed: number, replication: number): bigint {
  return splitmix64(splitmix64(BigInt(masterSeed)) + BigInt(replication));
}
