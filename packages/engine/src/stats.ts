import type { SummaryStat } from "@fabsim/schema";

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stddev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

/** Percentile with linear interpolation. p in [0, 100]. Sorts a copy. */
export function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (rank - lo) * (sorted[hi]! - sorted[lo]!);
}

// Two-sided 97.5% Student-t critical values for df = 1..30.
const T_975 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201,
  2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074,
  2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

function tCritical(df: number): number {
  if (df < 1) return Number.NaN;
  if (df <= 30) return T_975[df - 1]!;
  return 1.96;
}

/** Summary across replications: mean, sample sd, 95% CI (Student-t). */
export function summarize(xs: readonly number[]): SummaryStat {
  const m = mean(xs);
  const sd = stddev(xs);
  if (xs.length < 2) return { mean: m, sd, ci95: [m, m] };
  const half = tCritical(xs.length - 1) * (sd / Math.sqrt(xs.length));
  return { mean: m, sd, ci95: [m - half, m + half] };
}
