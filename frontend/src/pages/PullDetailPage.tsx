import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import type { Comment, Commit, FileChange, PullDetail } from "../api/types";
import { Avatar, ErrorBox, Flash, Loading } from "../components/common";
import { DiffView } from "../components/DiffView";
import { Markdown } from "../components/Markdown";
import { StatusIcon } from "../components/StatusIcon";
import { useApi } from "../hooks/useApi";
import { useTokens } from "../hooks/useTokens";
import { firstLine, timeAgo } from "../utils/format";

const TABS = ["conversation", "commits", "files", "checks"] as const;
type Tab = (typeof TABS)[number];

function PrState({ detail }: { detail: PullDetail }) {
  const { pr } = detail;
  if (pr.merged) return <span className="state-badge merged">⮌ Merged</span>;
  if (pr.state === "closed") return <span className="state-badge closed">⨯ Closed</span>;
  return <span className={`state-badge ${pr.draft ? "draft" : "open"}`}>⇄ {pr.draft ? "Draft" : "Open"}</span>;
}

function Conversation({ detail, base }: { detail: PullDetail; base: string }) {
  const { data: comments } = useApi<Comment[]>(`${base}/comments`);
  const events = [
    ...detail.reviews
      .filter((r) => r.state !== "PENDING")
      .map((r) => ({ key: `r${r.id}`, at: r.submitted_at, user: r.user, kind: r.state, body: r.body })),
    ...(comments ?? []).map((c) => ({ key: `c${c.id}`, at: c.created_at, user: c.user, kind: "COMMENTED", body: c.body })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const reviewText: Record<string, string> = {
    APPROVED: "approved these changes",
    CHANGES_REQUESTED: "requested changes",
    COMMENTED: "commented",
    DISMISSED: "had a review dismissed",
  };
  return (
    <div className="timeline">
      <div className="comment">
        <div className="comment-header">
          <Avatar user={detail.pr.user} /> <strong>{detail.pr.user.login}</strong>{" "}
          <span className="muted">opened {timeAgo(detail.pr.created_at)}</span>
        </div>
        <div className="comment-body">
          <Markdown text={detail.pr.body} />
        </div>
      </div>
      {events.map((e) => (
        <div key={e.key} className={`comment ${e.kind === "APPROVED" ? "approved" : ""}`}>
          <div className="comment-header">
            <Avatar user={e.user} /> <strong>{e.user.login}</strong>{" "}
            <span className="muted">
              {reviewText[e.kind] ?? e.kind.toLowerCase()} {timeAgo(e.at)}
            </span>
          </div>
          {e.body?.trim() && (
            <div className="comment-body">
              <Markdown text={e.body} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Commits({ base, owner, repo }: { base: string; owner: string; repo: string }) {
  const { data, error, loading } = useApi<Commit[]>(`${base}/commits`);
  if (loading && !data) return <Loading />;
  return (
    <>
      <ErrorBox error={error} />
      <ul className="box list">
        {data?.map((c) => (
          <li key={c.sha} className="list-item">
            <Avatar user={c.author} />
            <div className="grow">
              <a href={c.html_url} target="_blank" rel="noreferrer" className="list-title">
                {firstLine(c.commit.message)}
              </a>
              <div className="muted small">
                {c.author?.login ?? c.commit.author.name} committed {timeAgo(c.commit.author.date)}
              </div>
            </div>
            <Link to={`/${owner}/${repo}/actions?sha=${c.sha}`} className="mono small" title="Actions runs for this commit">
              {c.sha.slice(0, 7)}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function Files({ base }: { base: string }) {
  const { data, error, loading } = useApi<FileChange[]>(`${base}/files`);
  if (loading && !data) return <Loading />;
  return (
    <>
      <ErrorBox error={error} />
      {data && <DiffView files={data} />}
    </>
  );
}

function ChecksNotes({ detail }: { detail: PullDetail }) {
  if (!detail.checks_notes.length) return null;
  return (
    <Flash kind="warn">
      <span>
        {detail.checks_notes.map((note) => (
          <span key={note} className="block">
            {note}
          </span>
        ))}
      </span>
    </Flash>
  );
}

function Checks({ detail, owner, repo }: { detail: PullDetail; owner: string; repo: string }) {
  const { check_runs, statuses } = detail;
  return (
    <>
      <ChecksNotes detail={detail} />
      {!check_runs.length && !statuses.length ? (
        <p className="muted">No checks on this commit.</p>
      ) : (
        <ul className="box list">
          {check_runs.map((c) => (
            <li key={c.id} className="list-item">
              <StatusIcon status={c.status} conclusion={c.conclusion} />
              <span className="grow">{c.name}</span>
              {c.workflow_run_id ? (
                <Link to={`/${owner}/${repo}/actions/runs/${c.workflow_run_id}`} className="small">
                  Details
                </Link>
              ) : (
                <a href={c.html_url} target="_blank" rel="noreferrer" className="small">
                  Details
                </a>
              )}
            </li>
          ))}
          {statuses.map((s) => (
            <li key={s.id} className="list-item">
              <StatusIcon status={s.state === "pending" ? "in_progress" : "completed"} conclusion={s.state} />
              <span className="grow">
                {s.context} <span className="muted small">{s.description}</span>
              </span>
              {s.target_url && (
                <a href={s.target_url} target="_blank" rel="noreferrer" className="small">
                  Details
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function MergeBox({ detail, base, onDone }: { detail: PullDetail; base: string; onDone: () => void }) {
  const { tokens } = useTokens();
  const { pr, checks_summary: checks, reviews } = detail;
  const [method, setMethod] = useState<"merge" | "squash" | "rebase">("merge");
  const [busy, setBusy] = useState<"approve" | "merge" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const merger = tokens?.merge && !tokens.merge.error ? tokens.merge.login : null;
  const isAuthor = merger === pr.user.login;
  const alreadyApproved = reviews.some((r) => r.state === "APPROVED" && r.user.login === merger);
  const approvals = new Set(reviews.filter((r) => r.state === "APPROVED").map((r) => r.user.login));

  const run = async (kind: "approve" | "merge") => {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      if (kind === "approve") {
        await api.post(`${base}/approve`, { body: "LGTM" });
        setNotice(`Approved as ${merger}.`);
      } else {
        await api.put(`${base}/merge`, { sha: pr.head.sha, merge_method: method });
        setNotice(`Merged into ${pr.base.ref}.`);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const confirmMerge = () => {
    const warnings = [
      checks.failure ? `${checks.failure} check(s) failed.` : "",
      checks.pending ? `${checks.pending} check(s) still running.` : "",
    ].filter(Boolean);
    const message = [
      `Merge #${pr.number} (${pr.head.ref} → ${pr.base.ref}) with "${method}"?`,
      `Commit ${pr.head.sha.slice(0, 7)} as ${merger}.`,
      ...warnings,
    ].join("\n");
    if (window.confirm(message)) void run("merge");
  };

  if (pr.merged) {
    return (
      <div className="box merge-box merged">
        <div className="box-body">
          <strong>Merged</strong> by {pr.merged_by?.login} {timeAgo(pr.merged_at)} into{" "}
          <span className="mono">{pr.base.ref}</span>.
        </div>
      </div>
    );
  }
  if (pr.state === "closed") return null;

  const mergeable =
    pr.mergeable === null ? "GitHub is still checking whether this can merge…" : pr.mergeable ? "No conflicts with the base branch." : "This branch has conflicts that must be resolved on GitHub.";
  const checksText = checks.total
    ? `${checks.success} passed · ${checks.failure} failed · ${checks.pending} running${checks.skipped ? ` · ${checks.skipped} skipped` : ""}`
    : "No checks.";

  return (
    <div className="box merge-box">
      <div className="box-body">
        <div className="merge-row">
          <StatusIcon
            status={checks.pending ? "in_progress" : "completed"}
            conclusion={checks.failure ? "failure" : checks.total ? "success" : null}
          />
          <span>
            <strong>Checks:</strong> {checksText}
            {detail.checks_notes.length > 0 && <span className="muted small"> (partial, see Checks tab)</span>}
          </span>
        </div>
        <div className="merge-row">
          <StatusIcon status="completed" conclusion={approvals.size ? "success" : null} />
          <span>
            <strong>Approvals:</strong> {approvals.size ? [...approvals].join(", ") : "none yet"}
          </span>
        </div>
        <div className="merge-row">
          <StatusIcon status={pr.mergeable === null ? "queued" : "completed"} conclusion={pr.mergeable ? "success" : "failure"} />
          <span>
            {mergeable} <span className="muted small">({pr.mergeable_state})</span>
          </span>
        </div>
        {!merger && (
          <Flash kind="warn">
            Add <code>GITHUB_TOKEN_MERGE</code> under <Link to="/tokens">Tokens</Link> to approve and merge.
          </Flash>
        )}
        {merger && (
          <div className="row merge-actions">
            <button
              type="button"
              className="btn"
              disabled={busy !== null || isAuthor || alreadyApproved || pr.draft}
              title={isAuthor ? `${merger} opened this PR and can't approve it` : alreadyApproved ? "Already approved" : ""}
              onClick={() => void run("approve")}
            >
              {busy === "approve" ? "Approving…" : alreadyApproved ? "✔ Approved" : `Approve as ${merger}`}
            </button>
            <span className="spacer" />
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              <option value="merge">Create a merge commit</option>
              <option value="squash">Squash and merge</option>
              <option value="rebase">Rebase and merge</option>
            </select>
            <button
              type="button"
              className="btn btn-merge"
              disabled={busy !== null || pr.mergeable === false || pr.draft}
              onClick={confirmMerge}
            >
              {busy === "merge" ? "Merging…" : "Merge pull request"}
            </button>
          </div>
        )}
        {isAuthor && <p className="muted small">GITHUB_TOKEN_MERGE belongs to the PR author, so it can merge but not approve.</p>}
        <ErrorBox error={error} />
        {notice && <Flash kind="success">{notice}</Flash>}
      </div>
    </div>
  );
}

export function PullDetailPage() {
  const { owner = "", repo = "", number = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "conversation";
  const base = `/repos/${owner}/${repo}/pulls/${number}`;
  // Refresh every 15s while checks are running or GitHub hasn't worked out mergeability yet.
  const { data, error, loading, reload } = useApi<PullDetail>(base, {
    pollMs: 15000,
    shouldPoll: (d) => d.pr.state === "open" && (d.checks_summary.pending > 0 || d.pr.mergeable === null),
  });

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} onRetry={reload} />;
  const { pr } = data;

  return (
    <div>
      <div className="pr-title-row">
        <h2 className="pr-title">
          {pr.title} <span className="muted">#{pr.number}</span>
        </h2>
        <a href={pr.html_url} target="_blank" rel="noreferrer" className="btn btn-sm">
          Open on GitHub ↗
        </a>
      </div>
      <div className="pr-meta">
        <PrState detail={data} />
        <span>
          <strong>{pr.user.login}</strong> wants to merge {pr.commits} commit{pr.commits === 1 ? "" : "s"} into{" "}
          <span className="branch">{pr.base.ref}</span> from <span className="branch">{pr.head.ref}</span>
        </span>
        <span className="spacer" />
        <span className="add">+{pr.additions}</span> <span className="del">−{pr.deletions}</span>
        <button type="button" className="btn btn-sm" onClick={reload}>
          ↻
        </button>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <nav className="tabs sub">
        {TABS.map((t) => (
          <button key={t} type="button" className={t === tab ? "active" : ""} onClick={() => setParams(t === "conversation" ? {} : { tab: t })}>
            {t[0].toUpperCase() + t.slice(1)}
            {t === "commits" && <span className="counter">{pr.commits}</span>}
            {t === "files" && <span className="counter">{pr.changed_files}</span>}
            {t === "checks" && <span className="counter">{data.checks_summary.total}</span>}
          </button>
        ))}
        <span className="spacer" />
        <Link to={`/${owner}/${repo}/actions?branch=${encodeURIComponent(pr.head.ref)}`} className="small">
          Actions on {pr.head.ref} →
        </Link>
      </nav>
      {tab === "conversation" && (
        <>
          <Conversation detail={data} base={base} />
          <MergeBox detail={data} base={base} onDone={reload} />
        </>
      )}
      {tab === "commits" && <Commits base={base} owner={owner} repo={repo} />}
      {tab === "files" && <Files base={base} />}
      {tab === "checks" && <Checks detail={data} owner={owner} repo={repo} />}
    </div>
  );
}
