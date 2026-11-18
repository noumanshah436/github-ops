import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api, query } from "../api/client";
import type { Compare, Pull, PullPage, Repo } from "../api/types";
import { Empty, ErrorBox, Flash, Loading } from "../components/common";
import { DiffView } from "../components/DiffView";
import { Markdown } from "../components/Markdown";
import { useApi } from "../hooks/useApi";
import { firstLine } from "../utils/format";

interface PrBodyFile {
  title?: string;
  head?: string;
  base?: string;
  body?: string;
}

export function NewPullPage() {
  const { owner = "", repo = "" } = useParams();
  const navigate = useNavigate();
  const full = `${owner}/${repo}`;
  const { data: repos } = useApi<Repo[]>("/repos");
  const { data: branches, error: branchError } = useApi<string[]>(`/repos/${full}/branches`);
  const defaultBranch = repos?.find((r) => r.full_name === full)?.default_branch;

  const [base, setBase] = useState("");
  const [head, setHead] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default base: staging if the repo has it (your usual target), else the default branch.
  useEffect(() => {
    if (base || !branches) return;
    setBase(branches.includes("staging") ? "staging" : (defaultBranch ?? branches[0] ?? ""));
  }, [branches, defaultBranch, base]);

  const ready = base && head && base !== head;
  const { data: compare, error: compareError, loading: comparing } = useApi<Compare>(
    ready ? `/repos/${full}/compare${query({ base, head })}` : null,
  );
  const { data: existing } = useApi<PullPage>(ready ? `/repos/${full}/pulls${query({ state: "open", head })}` : null);
  const duplicate = existing?.items.find((p) => p.base.ref === base);

  // A single commit's message makes a good default title, as on GitHub.
  useEffect(() => {
    if (compare?.commits.length === 1 && !title) setTitle(firstLine(compare.commits[0].commit.message));
  }, [compare, title]);

  const fillFormFromPrBodyFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as PrBodyFile;
      if (parsed.title) setTitle(parsed.title);
      if (parsed.body) setBody(parsed.body);
      if (parsed.base && branches?.includes(parsed.base)) setBase(parsed.base);
      if (parsed.head && branches?.includes(parsed.head)) setHead(parsed.head);
      setError(parsed.head && !branches?.includes(parsed.head) ? `Branch "${parsed.head}" from the file isn't on GitHub yet. Push it first.` : null);
    } catch {
      setError("That file isn't valid pr_body.json (expected JSON with title, head, base, body).");
    }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const pr = await api.post<Pull>(`/repos/${full}/pulls`, { title, head, base, body, draft });
      navigate(`/${full}/pulls/${pr.number}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (!branches) return branchError ? <ErrorBox error={branchError} /> : <Loading what="Loading branches" />;

  return (
    <div>
      <h2>Open a pull request</h2>
      <div className="box">
        <div className="box-body row wrap">
          <label>
            base{" "}
            <select className="input" value={base} onChange={(e) => setBase(e.target.value)}>
              {branches.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <span>←</span>
          <label>
            compare{" "}
            <select className="input" value={head} onChange={(e) => setHead(e.target.value)}>
              <option value="">Choose a branch…</option>
              {branches
                .filter((b) => b !== base)
                .map((b) => (
                  <option key={b}>{b}</option>
                ))}
            </select>
          </label>
          <span className="spacer" />
          <label className="btn btn-sm file-btn">
            Load pr_body.json
            <input type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && void fillFormFromPrBodyFile(e.target.files[0])} />
          </label>
        </div>
        {compare && (
          <div className="box-footer small">
            {compare.ahead_by === 0 ? (
              <span>Nothing to compare: {head} has no commits that {base} doesn't have.</span>
            ) : (
              <span>
                <strong>{compare.ahead_by}</strong> commit{compare.ahead_by === 1 ? "" : "s"} ·{" "}
                <strong>{compare.files.length}</strong> file{compare.files.length === 1 ? "" : "s"} changed
                {compare.behind_by > 0 && ` · ${compare.behind_by} behind ${base}`}
              </span>
            )}
          </div>
        )}
      </div>
      <ErrorBox error={compareError} />
      {duplicate && (
        <Flash kind="warn">
          There's already an open PR for {head} → {base}:{" "}
          <Link to={`/${full}/pulls/${duplicate.number}`}>
            #{duplicate.number} {duplicate.title}
          </Link>
        </Flash>
      )}

      {ready && (
        <form
          className="box"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div className="box-body stack">
            <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <div className="segmented small">
              <button type="button" className={!preview ? "active" : ""} onClick={() => setPreview(false)}>
                Write
              </button>
              <button type="button" className={preview ? "active" : ""} onClick={() => setPreview(true)}>
                Preview
              </button>
            </div>
            {preview ? (
              <div className="preview">
                <Markdown text={body} />
              </div>
            ) : (
              <textarea className="input body-input mono" placeholder="Description (markdown)" value={body} onChange={(e) => setBody(e.target.value)} />
            )}
            <div className="row">
              <label className="small">
                <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Create as draft
              </label>
              <span className="spacer" />
              <span className="muted small">Uses GITHUB_TOKEN</span>
              <button type="submit" className="btn btn-primary" disabled={busy || !title.trim() || compare?.ahead_by === 0 || !!duplicate}>
                {busy ? "Creating…" : draft ? "Create draft pull request" : "Create pull request"}
              </button>
            </div>
            <ErrorBox error={error} />
          </div>
        </form>
      )}
      {!ready && <ErrorBox error={error} />}

      {comparing && !compare && <Loading what="Comparing branches" />}
      {compare && compare.ahead_by > 0 && (
        <>
          <h3>Commits</h3>
          <ul className="box list">
            {compare.commits.map((c) => (
              <li key={c.sha} className="list-item">
                <span className="grow">{firstLine(c.commit.message)}</span>
                <span className="mono small">{c.sha.slice(0, 7)}</span>
              </li>
            ))}
          </ul>
          <h3>Files changed</h3>
          {compare.files.length ? <DiffView files={compare.files} /> : <Empty>No file changes.</Empty>}
        </>
      )}
    </div>
  );
}
