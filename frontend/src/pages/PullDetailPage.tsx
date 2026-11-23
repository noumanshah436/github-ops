import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import type { Commit, FileChange, Pull, PullDetail, TokenKind } from "../api/types";
import { Avatar, CopyButton, ErrorBox, Flash, Loading } from "../components/common";
import { DiffView } from "../components/DiffView";
import { CommentBox } from "../components/pull/CommentBox";
import { MergeBox } from "../components/pull/MergeBox";
import { ReviewPanel } from "../components/pull/ReviewPanel";
import { Sidebar } from "../components/pull/Sidebar";
import { Timeline } from "../components/pull/Timeline";
import { StatusIcon } from "../components/StatusIcon";
import { useAccounts, useAction, type Account } from "../hooks/useAccounts";
import { useApi } from "../hooks/useApi";
import { firstLine, timeAgo } from "../utils/format";

const TABS = ["conversation", "commits", "files", "checks"] as const;
type Tab = (typeof TABS)[number];

function PrState({ detail }: { detail: PullDetail }) {
  const { pr } = detail;
  if (pr.merged) return <span className="state-badge merged">⮌ Merged</span>;
  if (pr.state === "closed") return <span className="state-badge closed">⨯ Closed</span>;
  return <span className={`state-badge ${pr.draft ? "draft" : "open"}`}>⇄ {pr.draft ? "Draft" : "Open"}</span>;
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


/** Inline editor for the title and (while open) the base branch. */
function TitleEditor({
  pr,
  base,
  repoBase,
  account,
  onDone,
  onCancel,
}: {
  pr: Pull;
  base: string;
  repoBase: string;
  account: Account | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(pr.title);
  const [baseRef, setBaseRef] = useState(pr.base.ref);
  const { data: branches } = useApi<string[]>(pr.state === "open" ? `${repoBase}/branches` : null);
  const action = useAction();
  const save = async () => {
    const changes: { title?: string; base?: string } = {};
    if (title.trim() && title.trim() !== pr.title) changes.title = title.trim();
    if (baseRef !== pr.base.ref) changes.base = baseRef;
    if (!changes.title && !changes.base) return onCancel();
    if (changes.base && !window.confirm(`Change the base branch from ${pr.base.ref} to ${baseRef}?`)) return;
    const ok = await action.run("save", () => api.patch(base, { ...changes, account: account?.kind ?? "create" }).then(() => {}));
    if (ok) onDone();
  };
  return (
    <div className="stack title-editor">
      <div className="row">
        <input
          className="input grow title-input"
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") onCancel();
          }}
        />
        <button type="button" className="btn btn-primary" disabled={action.busy !== null || !title.trim() || !account} onClick={() => void save()}>
          {action.busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {pr.state === "open" && (
        <label className="row small">
          Base branch
          <select className="input" value={baseRef} onChange={(e) => setBaseRef(e.target.value)}>
            {[...new Set([pr.base.ref, ...(branches ?? [])])]
              .filter((b) => b !== pr.head.ref)
              .map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
          </select>
        </label>
      )}
      <ErrorBox error={action.error} />
    </div>
  );
}

/** Which saved account performs comments, close/reopen, edits and sidebar changes. */
function AccountPicker({ accounts, value, onChange }: { accounts: Account[]; value: Account | null; onChange: (kind: TokenKind) => void }) {
  if (!value) return null;
  if (accounts.length < 2) {
    return (
      <span className="muted small" title="Comments, close/reopen, edits and sidebar changes use this account">
        acting as <Avatar user={value.user} size={16} /> {value.login}
      </span>
    );
  }
  return (
    <label className="small row" title="Comments, close/reopen, edits and sidebar changes use this account. Reviews and merges always use GITHUB_TOKEN_MERGE.">
      Acting as
      <select className="input input-sm" value={value.kind} onChange={(e) => onChange(e.target.value as TokenKind)}>
        {accounts.map((a) => (
          <option key={a.kind} value={a.kind}>
            {a.login} ({a.kind === "create" ? "GITHUB_TOKEN" : "GITHUB_TOKEN_MERGE"})
          </option>
        ))}
      </select>
    </label>
  );
}

const ACCOUNT_KEY = "gh-ops:acting-account";

function savedAccount(): TokenKind {
  try {
    return localStorage.getItem(ACCOUNT_KEY) === "merge" ? "merge" : "create";
  } catch {
    return "create";
  }
}

export function PullDetailPage() {
  const { owner = "", repo = "", number = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "conversation";
  const repoBase = `/repos/${owner}/${repo}`;
  const base = `${repoBase}/pulls/${number}`;
  // Refresh every 15s while checks are running or GitHub hasn't worked out mergeability yet.
  const { data, error, loading, reload } = useApi<PullDetail>(base, {
    pollMs: 15000,
    shouldPoll: (d) => d.pr.state === "open" && (d.checks_summary.pending > 0 || d.pr.mergeable === null),
  });
  const accounts = useAccounts();
  const [accountKind, setAccountKind] = useState<TokenKind>(savedAccount);
  const account = accounts.find((a) => a.kind === accountKind) ?? accounts[0] ?? null;
  const merger = accounts.find((a) => a.kind === "merge") ?? null;
  const [editingTitle, setEditingTitle] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  // Bumped after every write so the timeline (comments, events) refetches too.
  const [refreshKey, setRefreshKey] = useState(0);
  const changed = () => {
    reload();
    setRefreshKey((k) => k + 1);
  };
  const chooseAccount = (kind: TokenKind) => {
    setAccountKind(kind);
    try {
      localStorage.setItem(ACCOUNT_KEY, kind);
    } catch {
      // remembering the choice is optional
    }
  };
  useEffect(() => {
    setEditingTitle(false);
    setReviewing(false);
  }, [number]);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} onRetry={reload} />;
  const { pr } = data;

  return (
    <div>
      {editingTitle ? (
        <TitleEditor
          pr={pr}
          base={base}
          repoBase={repoBase}
          account={account}
          onCancel={() => setEditingTitle(false)}
          onDone={() => {
            setEditingTitle(false);
            changed();
          }}
        />
      ) : (
        <div className="pr-title-row">
          <h2 className="pr-title">
            {pr.title} <span className="muted">#{pr.number}</span>
          </h2>
          <button type="button" className="btn btn-sm" disabled={!account} onClick={() => setEditingTitle(true)}>
            Edit
          </button>
          <a href={pr.html_url} target="_blank" rel="noreferrer" className="btn btn-sm">
            Open on GitHub ↗
          </a>
          <CopyButton text={pr.html_url} label="Copy URL" title={pr.html_url} />
        </div>
      )}
      <div className="pr-meta">
        <PrState detail={data} />
        <span>
          <strong>{pr.user.login}</strong> {pr.merged ? "merged" : "wants to merge"} {pr.commits} commit{pr.commits === 1 ? "" : "s"} into{" "}
          <span className="branch">{pr.base.ref}</span> from <span className="branch">{pr.head.ref}</span>
        </span>
        <span className="spacer" />
        <AccountPicker accounts={accounts} value={account} onChange={chooseAccount} />
        <span className="add">+{pr.additions}</span> <span className="del">−{pr.deletions}</span>
        <button type="button" className="btn btn-sm" onClick={changed} title="Refresh">
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
        {pr.state === "open" && (
          <button type="button" className={`btn btn-sm ${reviewing ? "" : "btn-primary"}`} onClick={() => setReviewing((r) => !r)}>
            Review changes ▾
          </button>
        )}
      </nav>
      {reviewing && pr.state === "open" && <ReviewPanel pr={pr} base={base} merger={merger} onDone={changed} onClose={() => setReviewing(false)} />}
      {tab === "conversation" && (
        <div className="pr-layout">
          <div className="pr-main">
            <Timeline detail={data} base={base} repoBase={repoBase} account={account} accounts={accounts} refreshKey={refreshKey} onChanged={changed} />
            <MergeBox detail={data} base={base} account={account} merger={merger} onDone={changed} />
            <CommentBox pr={pr} base={base} account={account} onDone={changed} />
          </div>
          <Sidebar detail={data} base={base} repoBase={repoBase} account={account} onChanged={changed} />
        </div>
      )}
      {tab === "commits" && <Commits base={base} owner={owner} repo={repo} />}
      {tab === "files" && <Files base={base} />}
      {tab === "checks" && <Checks detail={data} owner={owner} repo={repo} />}
    </div>
  );
}
