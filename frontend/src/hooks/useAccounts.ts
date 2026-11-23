import { useCallback, useState } from "react";

import type { TokenKind, User } from "../api/types";
import { useTokens } from "./useTokens";

/** A saved token that works, and the GitHub account it belongs to. */
export interface Account {
  kind: TokenKind;
  login: string;
  user: User;
}

export function useAccounts(): Account[] {
  const { tokens } = useTokens();
  return (["create", "merge"] as const).flatMap((kind) => {
    const t = tokens?.[kind];
    return t && !t.error && t.login ? [{ kind, login: t.login, user: { login: t.login, avatar_url: t.avatar_url ?? "" } }] : [];
  });
}

/**
 * Run one write at a time and keep its error / notice. `run` returns true on success.
 * `busy` names the running action so its button can say "Closing…" etc.
 */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = useCallback(async (name: string, action: () => Promise<string | void>): Promise<boolean> => {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      const message = await action();
      if (message) setNotice(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, error, notice, run, setError };
}
