import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import type { TokenInfo, TokenKind } from "../api/types";
import { Avatar, ErrorBox, Flash } from "../components/common";
import { useTokens } from "../hooks/useTokens";
import { lastRepo } from "../utils/repo";

const CARDS: { kind: TokenKind; name: string; use: string }[] = [
  {
    kind: "create",
    name: "GITHUB_TOKEN",
    use: "Creates PRs and reads PRs, checks and Actions. Needs Pull requests: read & write, Contents: read, Actions: read (read & write to re-run or cancel).",
  },
  {
    kind: "merge",
    name: "GITHUB_TOKEN_MERGE",
    use: "Approves and merges. Use a different account from the PR author, since GitHub won't let you approve your own PR. Needs Pull requests: read & write and Contents: read & write.",
  },
];

function TokenCard({ kind, name, use, info }: { kind: TokenKind; name: string; use: string; info: TokenInfo | null }) {
  const { reload } = useTokens();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const result = await api.put<TokenInfo>(`/tokens/${kind}`, { token: value });
      setValue("");
      setSaved(`Saved. Signed in as ${result.login}.`);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remove ${name} from backend/.env?`)) return;
    await api.del(`/tokens/${kind}`);
    setSaved(null);
    reload();
  };

  return (
    <section className="box">
      <div className="box-header">
        <h3 className="mono">{name}</h3>
      </div>
      <div className="box-body">
        <p className="muted">{use}</p>
        {info ? (
          <div className="token-current">
            {info.error ? (
              <Flash kind="error">
                Saved token <code>{info.masked}</code> doesn't work: {info.error}
              </Flash>
            ) : (
              <p>
                <Avatar user={info.login ? { login: info.login, avatar_url: info.avatar_url ?? "" } : null} />{" "}
                <strong>{info.login}</strong> · <code>{info.masked}</code> ·{" "}
                <span className="muted">
                  from {info.source === "environment" ? "an exported shell variable" : "backend/.env"}
                  {info.scopes ? ` · scopes: ${info.scopes}` : ""}
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="muted">Not set.</p>
        )}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) void save();
          }}
        >
          <input
            type="password"
            className="input grow mono"
            placeholder={info ? "Paste a new token to replace it" : "Paste token (github_pat_… or ghp_…)"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !value.trim()}>
            {busy ? "Checking…" : "Save"}
          </button>
          {info?.source === "env_file" && (
            <button type="button" className="btn btn-danger" onClick={() => void remove()}>
              Remove
            </button>
          )}
        </form>
        <ErrorBox error={error} />
        {saved && <Flash kind="success">{saved}</Flash>}
      </div>
    </section>
  );
}

export function TokensPage() {
  const { tokens, error, reload } = useTokens();
  const repo = lastRepo();
  return (
    <div className="narrow">
      <h2>Tokens</h2>
      <p className="muted">
        Tokens are checked against GitHub, then saved in <code>backend/.env</code> on this computer. The browser only
        ever sees a masked copy.
      </p>
      <ErrorBox error={error} onRetry={reload} />
      {CARDS.map((card) => (
        <TokenCard key={card.kind} {...card} info={tokens?.[card.kind] ?? null} />
      ))}
      {tokens?.create && !tokens.create.error && (
        <p>{repo ? <Link to={`/${repo}/pulls`}>Go to {repo} →</Link> : "Pick a repository at the top."}</p>
      )}
    </div>
  );
}
