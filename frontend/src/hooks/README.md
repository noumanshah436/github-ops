# hooks

Custom React hooks for loading data, reading the current repo from the URL and sharing token state.

## Files

| File | Description |
|------|-------------|
| `useApi.ts` | GETs a backend path with loading/error state and `reload()`, and can keep polling while a condition holds (e.g. a run is still in progress) |
| `useRepoParams.ts` | Returns `{ owner, repo }` from `/:owner/:repo/*`, usable in layout components above the repo routes |
| `useAccounts.ts` | `useAccounts()` lists the saved tokens that work with their GitHub login; `useAction()` runs one write at a time with busy/error/notice state |
| `useTokens.tsx` | `TokensProvider` context that loads `/tokens` once, and `useTokens()` to read or reload it |
