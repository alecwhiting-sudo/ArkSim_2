export const fmtHours = (h: number): string =>
  !Number.isFinite(h) ? "—" : h < 1 ? `${(h * 60).toFixed(1)} min` : `${h.toFixed(2)} h`;

export const fmtPct = (x: number): string => `${(x * 100).toFixed(0)}%`;

export const fmtMoney = (x: number): string =>
  x >= 1000 ? `$${(x / 1000).toFixed(1)}k` : `$${x.toFixed(2)}`;

export const fmtNum = (x: number, dp = 1): string => x.toFixed(dp);
