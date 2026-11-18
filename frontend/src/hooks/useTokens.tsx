import { createContext, useContext, type ReactNode } from "react";

import type { Tokens } from "../api/types";
import { useApi } from "./useApi";

interface TokensState {
  tokens: Tokens | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const TokensContext = createContext<TokensState>({ tokens: null, loading: true, error: null, reload: () => {} });

export function TokensProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, reload } = useApi<Tokens>("/tokens");
  return (
    <TokensContext.Provider value={{ tokens: data, loading, error, reload }}>{children}</TokensContext.Provider>
  );
}

export const useTokens = () => useContext(TokensContext);
