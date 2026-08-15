import type { RunResult } from "@fabsim/schema";
import { agentifyAllScenario, templates } from "@fabsim/templates";
import { useCallback, useEffect, useRef, useState } from "react";

const config = { durationHours: 700, warmupHours: 100, replications: 5, seed: 42 };

type WorkerReply =
  | { ok: true; result: RunResult }
  | { ok: false; error: string };

const fmtH = (h: number) => (h < 1 ? `${(h * 60).toFixed(1)} min` : `${h.toFixed(2)} h`);
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

export function App() {
  const model = templates[0]!;
  const [baseline, setBaseline] = useState<RunResult | null>(null);
  const [agentified, setAgentified] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  const run = useCallback(() => {
    const w = workerRef.current;
    if (!w || running) return;
    setRunning(true);
    setError(null);
    setBaseline(null);
    setAgentified(null);
    const results: RunResult[] = [];
    w.onmessage = (e: MessageEvent<WorkerReply>) => {
      if (!e.data.ok) {
        setError(e.data.error);
        setRunning(false);
        return;
      }
      results.push(e.data.result);
      if (results.length === 1) {
        setBaseline(results[0]!);
      } else {
        setAgentified(results[1]!);
        setRunning(false);
      }
    };
    w.postMessage({ model, config });
    w.postMessage({ model, config, scenario: agentifyAllScenario(model) });
  }, [model, running]);

  return (
    <main style={styles.page}>
      <header>
        <h1 style={styles.h1}>FabSim</h1>
        <p style={styles.sub}>
          Walking skeleton — {model.name}, simulated {config.durationHours}h ×{" "}
          {config.replications} replications, baseline vs. all candidate steps agentified.
        </p>
      </header>
      <button style={styles.button} onClick={run} disabled={running}>
        {running ? "Simulating…" : "Run baseline vs. agentified"}
      </button>
      {error && <p style={{ color: "#b04a2a" }}>{error}</p>}
      <div style={styles.cols}>
        <ResultCard title="Baseline (human)" result={baseline} />
        <ResultCard title="Agentified" result={agentified} baseline={baseline} />
      </div>
    </main>
  );
}

function ResultCard({
  title,
  result,
  baseline,
}: {
  title: string;
  result: RunResult | null;
  baseline?: RunResult | null;
}) {
  return (
    <section style={styles.card}>
      <h2 style={styles.h2}>{title}</h2>
      {!result ? (
        <p style={styles.sub}>No results yet.</p>
      ) : (
        <dl style={styles.dl}>
          <Kpi
            label="Cycle time (mean)"
            value={fmtH(result.cycleTimeHours.mean.mean)}
            delta={baseline ? result.cycleTimeHours.mean.mean / baseline.cycleTimeHours.mean.mean - 1 : null}
          />
          <Kpi label="Cycle time (P90)" value={fmtH(result.cycleTimeHours.p90)} />
          <Kpi
            label="Throughput"
            value={`${result.throughputPerHour.mean.toFixed(1)} / h`}
          />
          <Kpi
            label="Cost per case"
            value={`$${result.cost.perCase.toFixed(2)}`}
            delta={baseline ? result.cost.perCase / baseline.cost.perCase - 1 : null}
          />
          <Kpi label="Agent cost share" value={pct(result.cost.agentShare)} />
          <Kpi label="Escalated cases" value={String(result.counts.escalated)} />
          {result.pools
            .filter((p) => p.utilization !== null)
            .map((p) => (
              <Kpi key={p.poolId} label={`Utilization — ${p.poolId}`} value={pct(p.utilization!)} />
            ))}
        </dl>
      )}
    </section>
  );
}

function Kpi({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  return (
    <div style={styles.kpi}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={styles.dd}>
        {value}
        {delta != null && Number.isFinite(delta) && (
          <span style={{ color: delta <= 0 ? "#116b62" : "#b04a2a", marginLeft: 8, fontSize: 13 }}>
            {delta > 0 ? "+" : ""}
            {(delta * 100).toFixed(0)}%
          </span>
        )}
      </dd>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: "system-ui, sans-serif",
    maxWidth: 900,
    margin: "0 auto",
    padding: "2rem 1.5rem",
    color: "#20282b",
  },
  h1: { margin: "0 0 0.25rem", fontSize: "1.8rem" },
  h2: { margin: "0 0 0.75rem", fontSize: "1.1rem" },
  sub: { color: "#5c6b6c", margin: "0 0 1rem" },
  button: {
    padding: "0.6rem 1.2rem",
    fontSize: "1rem",
    borderRadius: 6,
    border: "1px solid #116b62",
    background: "#116b62",
    color: "#fff",
    cursor: "pointer",
    marginBottom: "1.5rem",
  },
  cols: { display: "flex", gap: "1.5rem", flexWrap: "wrap" },
  card: {
    flex: "1 1 320px",
    border: "1px solid #d8dedb",
    borderRadius: 8,
    padding: "1rem 1.25rem",
    background: "#fbfcfb",
  },
  dl: { margin: 0 },
  kpi: {
    display: "flex",
    justifyContent: "space-between",
    borderBottom: "1px solid #eef2f0",
    padding: "0.4rem 0",
  },
  dt: { color: "#5c6b6c", fontSize: 14 },
  dd: { margin: 0, fontVariantNumeric: "tabular-nums", fontWeight: 600 },
};
