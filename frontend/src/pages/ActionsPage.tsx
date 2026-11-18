import { Link, useParams, useSearchParams } from "react-router-dom";

import { query } from "../api/client";
import type { RunPage, Workflow } from "../api/types";
import { Avatar, Empty, ErrorBox, Loading } from "../components/common";
import { StatusIcon } from "../components/StatusIcon";
import { useApi } from "../hooks/useApi";
import { duration, timeAgo } from "../utils/format";

const STATUSES = ["", "in_progress", "queued", "completed", "failure", "success"];
const PAGE_SIZE = 30;

export function ActionsPage() {
  const { owner, repo } = useParams();
  const [params, setParams] = useSearchParams();
  const branch = params.get("branch") ?? "";
  const workflow = params.get("workflow") ?? "";
  const status = params.get("status") ?? "";
  const sha = params.get("sha") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const base = `/repos/${owner}/${repo}/actions`;

  const { data: workflows } = useApi<Workflow[]>(`${base}/workflows`);
  const { data: branches } = useApi<string[]>(`/repos/${owner}/${repo}/branches`);
  // Refresh every 10s while anything is queued or running.
  const { data, error, loading, reload } = useApi<RunPage>(
    `${base}/runs${query({ branch, workflow, status, head_sha: sha, page, per_page: PAGE_SIZE })}`,
    { pollMs: 10000, shouldPoll: (p) => p.items.some((r) => r.status !== "completed") },
  );
  const runs = data?.items;
  const active = runs?.filter((r) => r.status !== "completed").length ?? 0;

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // A new filter gives a different list, so start again from page 1.
    if (key !== "page") next.delete("page");
    setParams(next);
  };
  const goToPage = (n: number) => {
    setFilter("page", n > 1 ? String(n) : "");
    window.scrollTo({ top: 0 });
  };

  return (
    <div>
      <div className="list-toolbar wrap">
        <select className="input" value={workflow} onChange={(e) => setFilter("workflow", e.target.value)}>
          <option value="">All workflows</option>
          {workflows?.map((w) => (
            <option key={w.id} value={w.path.split("/").pop()}>
              {w.name}
            </option>
          ))}
        </select>
        <select className="input" value={branch} onChange={(e) => setFilter("branch", e.target.value)}>
          <option value="">All branches</option>
          {branch && !branches?.includes(branch) && <option value={branch}>{branch}</option>}
          {branches?.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <select className="input" value={status} onChange={(e) => setFilter("status", e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? s.replace("_", " ") : "Any status"}
            </option>
          ))}
        </select>
        {sha && (
          <button type="button" className="btn btn-sm" onClick={() => setFilter("sha", "")}>
            commit {sha.slice(0, 7)} ✕
          </button>
        )}
        <span className="spacer" />
        {active > 0 && <span className="live">● {active} running · auto-refreshing</span>}
        <button type="button" className="btn btn-sm" onClick={reload}>
          ↻ Refresh
        </button>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !runs && <Loading />}
      {runs && !runs.length && (
        <Empty>{page > 1 ? `Page ${page} has no runs.` : "No workflow runs match these filters."}</Empty>
      )}
      {runs && runs.length > 0 && (
        <ul className="box list">
          {runs.map((run) => (
            <li key={run.id} className="list-item">
              <StatusIcon status={run.status} conclusion={run.conclusion} />
              <div className="grow">
                <Link to={`/${owner}/${repo}/actions/runs/${run.id}`} className="list-title">
                  {run.display_title}
                </Link>
                <div className="muted small">
                  <strong>{run.name}</strong> #{run.run_number} · {run.event} ·{" "}
                  <span className="branch">{run.head_branch}</span> · <span className="mono">{run.head_sha.slice(0, 7)}</span>{" "}
                  · <Avatar user={run.actor} size={14} /> {run.actor?.login}
                </div>
              </div>
              <div className="run-times small muted">
                <div>{timeAgo(run.created_at)}</div>
                <div>⏱ {duration(run.run_started_at, run.status === "completed" ? run.updated_at : null)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && (data.last_page > 1 || page > 1) && (
        <div className="pager">
          <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
            ‹ Previous
          </button>
          <span className="muted small">
            Page {page} of {data.last_page} · {data.total_count} runs
          </span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={page >= data.last_page}
            onClick={() => goToPage(page + 1)}
          >
            Next ›
          </button>
        </div>
      )}
    </div>
  );
}
