import { fmtHours } from "../format";
import type { SensitivityResults } from "../sensitivity";

/**
 * Tornado chart: for each parameter, cycle time at its low and high setting
 * versus the base run. Bars sorted by impact; every bar end carries its value
 * in ink, so color never works alone.
 */
export function Tornado({ results }: { results: SensitivityResults }) {
  const { baseCycle } = results;
  const rows = [...results.rows].sort(
    (a, b) =>
      Math.max(Math.abs(b.lowCycle - baseCycle), Math.abs(b.highCycle - baseCycle)) -
      Math.max(Math.abs(a.lowCycle - baseCycle), Math.abs(a.highCycle - baseCycle)),
  );
  const values = rows.flatMap((r) => [r.lowCycle, r.highCycle, baseCycle]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1e-9);
  const pad = span * 0.12;
  const x = (v: number) => ((v - min + pad) / (span + 2 * pad)) * 100;

  const rowH = 30;
  const labelW = 190;
  const height = rows.length * rowH + 24;

  return (
    <div className="tornado">
      <div className="tornado__legend">
        <span>
          <i className="tornado__swatch tornado__swatch--low" /> parameter low
        </span>
        <span>
          <i className="tornado__swatch tornado__swatch--high" /> parameter high
        </span>
        <span className="tornado__base-label">| base {fmtHours(baseCycle)}</span>
      </div>
      <svg
        className="tornado__svg"
        viewBox={`0 0 720 ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Tornado chart of cycle-time sensitivity"
      >
        {rows.map((r, i) => {
          const y = i * rowH + 18;
          const plotX = (v: number) => labelW + (x(v) / 100) * (720 - labelW - 10);
          const bx = plotX(baseCycle);
          const lx = plotX(r.lowCycle);
          const hx = plotX(r.highCycle);
          return (
            <g key={r.key}>
              <text x={labelW - 8} y={y + 4} textAnchor="end" className="tornado__label">
                {r.label}
              </text>
              <rect
                x={Math.min(bx, lx)}
                y={y - 6}
                width={Math.max(2, Math.abs(lx - bx))}
                height={5}
                rx={2}
                className="tornado__bar--low"
              />
              <rect
                x={Math.min(bx, hx)}
                y={y + 1}
                width={Math.max(2, Math.abs(hx - bx))}
                height={5}
                rx={2}
                className="tornado__bar--high"
              />
              <text
                x={lx + (lx >= bx ? 6 : -6)}
                y={y - 2}
                textAnchor={lx >= bx ? "start" : "end"}
                className="tornado__value"
              >
                {fmtHours(r.lowCycle)}
              </text>
              <text
                x={hx + (hx >= bx ? 6 : -6)}
                y={y + 8}
                textAnchor={hx >= bx ? "start" : "end"}
                className="tornado__value"
              >
                {fmtHours(r.highCycle)}
              </text>
            </g>
          );
        })}
        <line
          x1={labelW + (x(baseCycle) / 100) * (720 - labelW - 10)}
          y1={4}
          x2={labelW + (x(baseCycle) / 100) * (720 - labelW - 10)}
          y2={height - 4}
          className="tornado__baseline"
        />
      </svg>
    </div>
  );
}
