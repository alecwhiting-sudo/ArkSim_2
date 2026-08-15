import type { Distribution } from "@fabsim/schema";
import type { Pcg32 } from "./rng";

function standardNormal(rng: Pcg32): number {
  // Box–Muller. Two fresh uniforms per draw keeps the RNG stream deterministic
  // and position-independent (no cached spare that reorders draws).
  const u1 = rng.next();
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function sample(d: Distribution, rng: Pcg32): number {
  switch (d.kind) {
    case "constant":
      return d.value;
    case "uniform":
      return d.min + (d.max - d.min) * rng.next();
    case "exponential":
      return -d.mean * Math.log(rng.next());
    case "lognormal": {
      const sigma2 = Math.log(1 + d.cv * d.cv);
      const mu = Math.log(d.mean) - sigma2 / 2;
      return Math.exp(mu + Math.sqrt(sigma2) * standardNormal(rng));
    }
    case "triangular": {
      const { min, mode, max } = d;
      const u = rng.next();
      const fc = (mode - min) / (max - min);
      return u < fc
        ? min + Math.sqrt(u * (max - min) * (mode - min))
        : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    }
  }
}
