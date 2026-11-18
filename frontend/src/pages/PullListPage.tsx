import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { api, query } from "../api/client";
import type { PullPage, PullSummary } from "../api/types";
import { Avatar, Empty, ErrorBox, Loading } from "../components/common";
import { useApi } from "../hooks/useApi";
import { timeAgo } from "../utils/format";

const STATES = ["open", "closed", "all"] as const;
const PAGE_SIZE = 25;

function stateIcon(pr: PullSummary) {
  if (pr.merged_at) return <span className="pr-icon merged" title="Merged">⮌</span>;
  if (pr.state === "closed") return <span className="pr-icon closed" title="Closed">⨯</span>;
  return <span className={`pr-icon ${pr.draft ? "draft" : "open"}`} title={pr.draft ? "Draft" : "Open"}>⇄</span>;
}

export function PullListPage() {
  const { owner, repo } = useParams();
  const [params, setParams] = useSearchParams();
  const state = params.get("state") ?? "open";
  const path = `/repos/${owner}/${repo}/pulls`;
  const { data: first, error, loading, reload } = useApi<PullPage>(`${path}${query({ state, per_page: PAGE_SIZE })}`);

  // Pages after the first are appended by "Load more"; reset whenever the first page reloads.
  const [more, setMore] = useState<PullPage[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  useEffect(() => {
    setMore([]);
    setMoreError(null);
  }, [first]);

  const pages = first ? [first, ...more] : [];
  const items = pages.flatMap((p) => p.items);
  const last = pages[pages.length - 1];

  const loadMore = async () => {
    if (!last?.end_cursor) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await api.get<PullPage>(`${path}${query({ state, per_page: PAGE_SIZE, after: last.end_cursor })}`);
      setMore((m) => [...m, page]);
    } catch (e) {
      setMoreError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div>
      <div className="list-toolbar">
        <div className="segmented">
          {STATES.map((s) => (
            <button
              key={s}
              type="button"
              className={s === state ? "active" : ""}
              onClick={() => setParams(s === "open" ? {} : { state: s })}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        {first && (
          <span className="muted small">
            {items.length} of {first.total_count}
          </span>
        )}
        <span className="spacer" />
        <button type="button" className="btn btn-sm" onClick={reload}>
          ↻ Refresh
        </button>
        <Link to={`/${owner}/${repo}/pulls/new`} className="btn btn-sm btn-primary">
          New pull request
        </Link>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !first && <Loading />}
      {first && !items.length && <Empty>No {state === "all" ? "" : state} pull requests.</Empty>}
      {items.length > 0 && (
        <ul className="box list">
          {items.map((pr) => (
            <li key={pr.number} className="list-item">
              {stateIcon(pr)}
              <div className="grow">
                <Link to={`/${owner}/${repo}/pulls/${pr.number}`} className="list-title">
                  {pr.title}
                </Link>
                {pr.draft && <span className="pill pill-neutral">Draft</span>}
                <div className="muted small">
                  #{pr.number} · <span className="mono">{pr.head.ref}</span> → <span className="mono">{pr.base.ref}</span>{" "}
                  · opened {timeAgo(pr.created_at)} by <Avatar user={pr.user} size={14} /> {pr.user.login} · updated{" "}
                  {timeAgo(pr.updated_at)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ErrorBox error={moreError} onRetry={() => void loadMore()} />
      {first && last?.has_next_page && (
        <div className="load-more">
          <button type="button" className="btn" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading…" : `Load ${Math.min(PAGE_SIZE, first.total_count - items.length)} more`}
          </button>
        </div>
      )}
    </div>
  );
}
