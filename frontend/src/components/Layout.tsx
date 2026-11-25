import { NavLink, Outlet, useNavigate } from "react-router-dom";

import type { Repo } from "../api/types";
import { useApi } from "../hooks/useApi";
import { useRepoParams } from "../hooks/useRepoParams";
import { useTokens } from "../hooks/useTokens";
import { rememberRepo } from "../utils/repo";

function RepoPicker() {
  const params = useRepoParams();
  const navigate = useNavigate();
  const { tokens } = useTokens();
  const { data: repos, error } = useApi<Repo[]>(tokens?.create ? "/repos" : null);
  const current = params ? `${params.owner}/${params.repo}` : "";

  if (!tokens?.create) return null;
  return (
    <select
      className="repo-picker"
      value={current}
      title={error ?? "Repository"}
      onChange={(e) => {
        rememberRepo(e.target.value);
        navigate(`/${e.target.value}/pulls`);
      }}
    >
      {!current && <option value="">Choose a repository…</option>}
      {current && !repos?.some((r) => r.full_name === current) && <option value={current}>{current}</option>}
      {repos?.map((r) => (
        <option key={r.full_name} value={r.full_name}>
          {r.full_name}
          {r.private ? " 🔒" : ""}
        </option>
      ))}
    </select>
  );
}

function TokenBadge() {
  const { tokens } = useTokens();
  const parts = (["create", "merge"] as const).map((kind) => {
    const info = tokens?.[kind];
    const ok = info && !info.error;
    return (
      <span key={kind} className={`token-dot ${ok ? "ok" : "missing"}`} title={info?.env_name ?? kind}>
        {kind === "create" ? "GITHUB_TOKEN" : "GITHUB_TOKEN_MERGE"}
        {ok ? `: ${info.login}` : ": not set"}
      </span>
    );
  });
  return (
    <NavLink to="/tokens" className="token-badge">
      {parts}
    </NavLink>
  );
}

export function Layout() {
  const params = useRepoParams();
  const base = params ? `/${params.owner}/${params.repo}` : null;
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <img src="/logo.svg" alt="" className="brand-logo" />
          <span>
            github<span className="brand-ops">-ops</span>
          </span>
        </NavLink>
        <RepoPicker />
        <span className="spacer" />
        <TokenBadge />
      </header>
      {base && (
        <nav className="tabs">
          <NavLink to={`${base}/pulls`} end>
            Pull requests
          </NavLink>
          <NavLink to={`${base}/actions`}>Actions</NavLink>
          <NavLink to={`${base}/pulls/new`} className="tab-new">
            + New pull request
          </NavLink>
        </nav>
      )}
      <main className="content">
        <Outlet />
      </main>
      <footer className="footer">
        github-ops · built by Syed Nouman, Senior Software Engineer @ Meissasoft ·{" "}
        <a href="mailto:noumanshah436@gmail.com">noumanshah436@gmail.com</a>
      </footer>
    </div>
  );
}
