import { Link, Navigate } from "react-router-dom";

import type { Repo } from "../api/types";
import { ErrorBox, Loading } from "../components/common";
import { useApi } from "../hooks/useApi";
import { useTokens } from "../hooks/useTokens";
import { lastRepo, rememberRepo } from "../utils/repo";
import { timeAgo } from "../utils/format";

export function HomePage() {
  const { tokens, loading } = useTokens();
  const hasToken = !!tokens?.create && !tokens.create.error;
  const { data: repos, error } = useApi<Repo[]>(hasToken ? "/repos" : null);

  if (loading) return <Loading />;
  if (!hasToken) return <Navigate to="/tokens" replace />;
  const last = lastRepo();
  if (last) return <Navigate to={`/${last}/pulls`} replace />;

  return (
    <div className="narrow">
      <h2>Repositories</h2>
      <ErrorBox error={error} />
      {!repos && !error && <Loading />}
      <ul className="box list">
        {repos?.map((r) => (
          <li key={r.full_name} className="list-item">
            <Link to={`/${r.full_name}/pulls`} className="list-title grow" onClick={() => rememberRepo(r.full_name)}>
              {r.full_name}
            </Link>
            {r.private && <span className="pill pill-neutral">Private</span>}
            <span className="muted small">pushed {timeAgo(r.pushed_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
