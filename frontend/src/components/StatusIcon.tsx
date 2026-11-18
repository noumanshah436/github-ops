// One icon + colour for GitHub's status/conclusion pairs (check runs, Actions runs, jobs, steps).

export type Tone = "success" | "failure" | "pending" | "neutral";

export function toneOf(status: string | null | undefined, conclusion: string | null | undefined): Tone {
  if (status && status !== "completed") return "pending";
  switch (conclusion) {
    case "success":
      return "success";
    case "failure":
    case "timed_out":
    case "startup_failure":
    case "action_required":
    case "error":
      return "failure";
    default:
      return "neutral";
  }
}

const GLYPHS: Record<Tone, string> = { success: "✔", failure: "✖", pending: "●", neutral: "⊘" };

export function StatusIcon({ status, conclusion }: { status?: string | null; conclusion?: string | null }) {
  const tone = toneOf(status, conclusion);
  const label = status && status !== "completed" ? status.replace("_", " ") : (conclusion ?? "unknown");
  return (
    <span className={`status status-${tone}`} title={label} aria-label={label}>
      {GLYPHS[tone]}
    </span>
  );
}

export function StatusLabel({ status, conclusion }: { status?: string | null; conclusion?: string | null }) {
  const tone = toneOf(status, conclusion);
  const label = status && status !== "completed" ? status.replace("_", " ") : (conclusion ?? "unknown");
  return <span className={`pill pill-${tone}`}>{label}</span>;
}
