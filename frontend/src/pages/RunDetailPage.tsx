import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api } from "../api/client";
import type { Job, RunDetail } from "../api/types";
import { CopyButton, ErrorBox, Flash, Loading } from "../components/common";
import { StatusIcon, StatusLabel } from "../components/StatusIcon";
import { useApi } from "../hooks/useApi";
import { duration, timeAgo } from "../utils/format";

// GitHub log lines start with an ISO timestamp; drop it so the log reads like the web UI.
const stripTimestamp = (line: string) => line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s?/, "");

function logLineClass(line: string): string {
  if (line.startsWith("##[error]")) return "log-error";
  if (line.startsWith("##[warning]")) return "log-warn";
  if (line.startsWith("##[group]") || line.startsWith("##[section]")) return "log-group";
  return "";
}

function JobLog({ base, job }: { base: string; job: Job }) {
  const done = job.status === "completed";
  const { data, error, loading, reload } = useApi<string>(`${base}/jobs/${job.id}/logs`);
  const [errorsOnly, setErrorsOnly] = useState(false);
  if (loading && data === null) return <Loading what="Loading log" />;
  if (error) {
    return (
      <ErrorBox
        error={done ? error : `Logs appear once the job finishes on GitHub's side. (${error})`}
        onRetry={reload}
      />
    );
  }
  const lines = (data ?? "").split("\n").map(stripTimestamp);
  const shown = errorsOnly ? lines.filter((l) => l.startsWith("##[error]") || /error|failed|exception/i.test(l)) : lines;
  return (
    <div>
      <div className="row small log-toolbar">
        <label>
          <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} /> Only lines
          that look like errors
        </label>
        <span className="spacer" />
        <span className="muted">{lines.length} lines</span>
        <CopyButton
          text={() => `# ${job.name}\n${shown.join("\n")}`}
          label={errorsOnly ? "Copy shown" : "Copy log"}
          title={errorsOnly ? "Copy the filtered lines" : "Copy the whole log"}
        />
        <button type="button" className="btn btn-sm" onClick={reload}>
          ↻
        </button>
      </div>
      <pre className="log">
        {shown.map((line, i) => (
          <div key={i} className={logLineClass(line)}>
            {line || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}

function JobCard({ base, job }: { base: string; job: Job }) {
  const failed = job.conclusion === "failure";
  const [open, setOpen] = useState(failed);
  const [showLog, setShowLog] = useState(failed);
  return (
    <div className="box job">
      <button type="button" className="job-header" onClick={() => setOpen((v) => !v)}>
        <span className="chevron">{open ? "▾" : "▸"}</span>
        <StatusIcon status={job.status} conclusion={job.conclusion} />
        <strong>{job.name}</strong>
        <span className="spacer" />
        <span className="muted small">{duration(job.started_at, job.completed_at)}</span>
      </button>
      {open && (
        <div className="box-body">
          <ol className="steps">
            {job.steps?.map((s) => (
              <li key={s.number} className={s.conclusion === "failure" ? "step-failed" : ""}>
                <StatusIcon status={s.status} conclusion={s.conclusion} /> {s.name}
                <span className="muted small"> {duration(s.started_at, s.completed_at)}</span>
              </li>
            ))}
          </ol>
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={() => setShowLog((v) => !v)}>
              {showLog ? "Hide log" : "Show log"}
            </button>
            <a href={job.html_url} target="_blank" rel="noreferrer" className="small">
              Open job on GitHub ↗
            </a>
          </div>
          {showLog && <JobLog base={base} job={job} />}
        </div>
      )}
    </div>
  );
}

export function RunDetailPage() {
  const { owner, repo, runId } = useParams();
  const base = `/repos/${owner}/${repo}/actions`;
  const { data, error, loading, reload } = useApi<RunDetail>(`${base}/runs/${runId}`, {
    pollMs: 8000,
    shouldPoll: (d) => d.run.status !== "completed",
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} onRetry={reload} />;
  const { run, jobs } = data;
  const running = run.status !== "completed";
  const failedJobs = jobs.filter((j) => j.conclusion === "failure").length;

  const act = async (action: "rerun-failed" | "cancel") => {
    const label = action === "cancel" ? "Cancel this run?" : `Re-run the ${failedJobs} failed job(s)?`;
    if (!window.confirm(label)) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`${base}/runs/${run.id}/${action}`);
      setNotice(action === "cancel" ? "Cancel requested." : "Re-run started.");
      window.setTimeout(reload, 2000);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="small">
        <Link to={`/${owner}/${repo}/actions`}>← All runs</Link>
      </p>
      <div className="pr-title-row">
        <h2 className="pr-title">
          {run.display_title} <span className="muted">{run.name} #{run.run_number}</span>
        </h2>
        <a href={run.html_url} target="_blank" rel="noreferrer" className="btn btn-sm">
          Open on GitHub ↗
        </a>
      </div>
      <div className="pr-meta">
        <StatusLabel status={run.status} conclusion={run.conclusion} />
        <span>
          {run.event} on <span className="branch">{run.head_branch}</span> ·{" "}
          <span className="mono">{run.head_sha.slice(0, 7)}</span> · started {timeAgo(run.run_started_at)} · ⏱{" "}
          {duration(run.run_started_at, running ? null : run.updated_at)}
        </span>
        <span className="spacer" />
        {running && <span className="live">● auto-refreshing</span>}
        {running && (
          <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => void act("cancel")}>
            Cancel run
          </button>
        )}
        {!running && failedJobs > 0 && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void act("rerun-failed")}>
            Re-run failed jobs
          </button>
        )}
        <button type="button" className="btn btn-sm" onClick={reload}>
          ↻
        </button>
      </div>
      <ErrorBox error={actionError ?? error} />
      {notice && <Flash kind="success">{notice}</Flash>}
      {jobs.map((job) => (
        <JobCard key={job.id} base={base} job={job} />
      ))}
    </div>
  );
}
