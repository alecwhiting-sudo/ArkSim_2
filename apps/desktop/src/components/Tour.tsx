import { useState } from "react";

const STEPS = [
  {
    title: "Model the process",
    body: "Pick a template from the top bar, then click any step on the canvas to edit durations, rates, and staffing in the panel on the right. Flip a step between Human and Agent right on its card — that builds your agentification scenario.",
  },
  {
    title: "Run and compare",
    body: "Run simulates the baseline against your scenario and shows the deltas: cycle time, cost per case, and where queues move. Save named scenarios on the shelf below the canvas and use Compare all to table them side by side. Sensitivity shows which assumptions actually move the answer.",
  },
  {
    title: "Watch it flow",
    body: "▶ Watch replays the simulation live on the canvas — play, pause, change speed, and scrub time. Queues glow orange as they build, so you can see the bottleneck move before you read a single number.",
  },
];

const TOUR_KEY = "fabsim-tour-done";

/** Three-step first-run orientation. Dismissed state persists locally. */
export function Tour() {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(TOUR_KEY) !== "1";
    } catch {
      return false;
    }
  });

  if (!open) return null;

  const close = () => {
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      /* private mode — just close */
    }
    setOpen(false);
  };

  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;

  return (
    <div className="tour" role="dialog" aria-label="Getting started">
      <div className="tour__step">
        {step + 1} of {STEPS.length}
      </div>
      <h3 className="tour__title">{current.title}</h3>
      <p className="tour__body">{current.body}</p>
      <div className="tour__actions">
        <button type="button" className="btn btn--small" onClick={close}>
          Skip
        </button>
        <button
          type="button"
          className="btn btn--small btn--primary"
          onClick={() => (last ? close() : setStep(step + 1))}
        >
          {last ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );
}
