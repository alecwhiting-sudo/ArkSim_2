import { useCallback, useEffect, useRef, useState } from "react";
import { formatClock, Replay, type ReplaySnapshot } from "../replay";
import { useFabStore } from "../store";

/** Sim-hours advanced per real second at each speed setting. */
const SPEEDS = [
  { value: 0.1, label: "6 min/s" },
  { value: 0.5, label: "30 min/s" },
  { value: 1, label: "1 h/s" },
  { value: 3, label: "3 h/s" },
  { value: 12, label: "12 h/s" },
];

/**
 * Transport for the live replay: play/pause, speed, scrubbing, clock, and the
 * WIP chart drawing as the clock advances. Node-level queues/servers render on
 * the canvas itself via the published snapshot.
 */
export function WatchPanel() {
  const trace = useFabStore((s) => s.watchTrace);
  const model = useFabStore((s) => s.model);
  const publishWatch = useFabStore((s) => s.publishWatch);
  const setWatchTrace = useFabStore((s) => s.setWatchTrace);

  const replayRef = useRef<Replay | null>(null);
  const timeRef = useRef(0);
  const [snap, setSnap] = useState<ReplaySnapshot | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.5);

  const duration = trace?.durationHours ?? 0;

  const publish = useCallback(
    (s: ReplaySnapshot, isPlaying: boolean) => {
      setSnap(s);
      publishWatch(s, isPlaying);
    },
    [publishWatch],
  );

  // (Re)build the replay when a trace arrives.
  useEffect(() => {
    if (!trace) return;
    const replay = new Replay(
      trace.events,
      trace.durationHours,
      model.nodes.map((n) => n.id),
    );
    replayRef.current = replay;
    timeRef.current = 0;
    publish(replay.advanceTo(0), false);
    setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trace]);

  // The clock: advance sim-time by wall-time * speed while playing.
  useEffect(() => {
    if (!playing || !trace) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const replay = replayRef.current;
      if (!replay) return;
      const t = Math.min(timeRef.current + dt * speed, duration);
      timeRef.current = t;
      publish(replay.advanceTo(t), t < duration);
      if (t >= duration) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, trace, duration, publish]);

  const scrub = (t: number) => {
    const replay = replayRef.current;
    if (!replay) return;
    timeRef.current = t;
    publish(replay.advanceTo(t), playing);
  };

  if (!trace || !snap) return null;

  return (
    <section className="watch">
      <div className="watch__bar">
        <button
          type="button"
          className="btn btn--primary watch__play"
          onClick={() => {
            if (!playing && timeRef.current >= duration) scrub(0);
            setPlaying(!playing);
          }}
        >
          {playing ? "Pause" : timeRef.current >= duration ? "Replay" : "Play"}
        </button>
        <div className="watch__speeds" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`watch__speed${s.value === speed ? " is-on" : ""}`}
              onClick={() => setSpeed(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          className="watch__scrub"
          type="range"
          min={0}
          max={duration}
          step={0.05}
          value={snap.time}
          onChange={(e) => scrub(Number(e.target.value))}
          aria-label="Simulation time"
        />
        <div className="watch__clock">{formatClock(snap.time)}</div>
        <button type="button" className="btn" onClick={() => setWatchTrace(null)}>
          Close
        </button>
      </div>
      <div className="watch__body">
        <div className="watch__stats">
          <WatchStat label="Arrived" value={snap.arrived} />
          <WatchStat label="Completed" value={snap.completed} />
          <WatchStat label="In progress" value={snap.wip} />
          <WatchStat label="Escalated" value={snap.escalated} />
        </div>
        <div className="watch__chart">
          <div className="watch__chart-title">Work in progress over time</div>
          <WipChart snap={snap} duration={duration} />
        </div>
      </div>
    </section>
  );
}

function WatchStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="watch__stat">
      <span className="watch__stat-label">{label}</span>
      <span className="watch__stat-value">{value}</span>
    </div>
  );
}

function WipChart({ snap, duration }: { snap: ReplaySnapshot; duration: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width * dpr) canvas.width = width * dpr;
    if (canvas.height !== height * dpr) canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const pad = { l: 30, r: 10, t: 8, b: 18 };
    const w = width - pad.l - pad.r;
    const h = height - pad.t - pad.b;
    const series = snap.series;
    const maxWip = Math.max(4, ...series.map((p) => p.wip));
    const x = (t: number) => pad.l + (t / duration) * w;
    const y = (v: number) => pad.t + h - (v / maxWip) * h;

    // faint grid: every 12 sim-hours + two horizontal lines
    ctx.strokeStyle = "rgba(92, 107, 108, 0.15)";
    ctx.lineWidth = 1;
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillStyle = "#5c6b6c";
    for (let t = 12; t < duration; t += 12) {
      ctx.beginPath();
      ctx.moveTo(x(t), pad.t);
      ctx.lineTo(x(t), pad.t + h);
      ctx.stroke();
      ctx.fillText(`${t}h`, x(t) - 8, height - 5);
    }
    for (const v of [Math.round(maxWip / 2), maxWip]) {
      ctx.beginPath();
      ctx.moveTo(pad.l, y(v));
      ctx.lineTo(pad.l + w, y(v));
      ctx.stroke();
      ctx.fillText(String(v), 6, y(v) + 3);
    }

    // WIP line: 2px accent, endpoint emphasized
    if (series.length > 1) {
      ctx.strokeStyle = "#116b62";
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x(series[0]!.t), y(series[0]!.wip));
      for (const p of series) ctx.lineTo(x(p.t), y(p.wip));
      ctx.stroke();
      const last = series[series.length - 1]!;
      ctx.fillStyle = "#116b62";
      ctx.beginPath();
      ctx.arc(x(last.t), y(last.wip), 3.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = "#20282b";
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.fillText(String(last.wip), Math.min(x(last.t) + 7, width - 20), y(last.wip) + 4);
    }
  }, [snap, duration]);

  return <canvas ref={canvasRef} className="watch__canvas" />;
}
