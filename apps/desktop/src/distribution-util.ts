import type { Distribution } from "@fabsim/schema";

/** The single "headline duration" a non-specialist edits or reads. */
export function primaryOf(d: Distribution): number {
  switch (d.kind) {
    case "constant":
      return d.value;
    case "exponential":
    case "lognormal":
      return d.mean;
    case "uniform":
      return (d.min + d.max) / 2;
    case "triangular":
      return (d.min + d.mode + d.max) / 3;
    case "empirical":
      return d.values.reduce((s, v) => s + v, 0) / d.values.length;
  }
}

/** Scale a distribution's location by a factor, preserving its shape. */
export function scaleDistribution(d: Distribution, f: number): Distribution {
  switch (d.kind) {
    case "constant":
      return { ...d, value: d.value * f };
    case "exponential":
    case "lognormal":
      return { ...d, mean: d.mean * f };
    case "uniform":
      return { ...d, min: d.min * f, max: d.max * f };
    case "triangular":
      return { ...d, min: d.min * f, mode: d.mode * f, max: d.max * f };
    case "empirical":
      return { ...d, values: d.values.map((v) => v * f) };
  }
}

/** Rescale so the headline duration becomes `value`. */
export function withPrimary(d: Distribution, value: number): Distribution {
  const current = primaryOf(d);
  if (value <= 0 || current <= 0) return d;
  return scaleDistribution(d, value / current);
}
