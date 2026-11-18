# hooks

Custom React hooks for loading data, reading the current repo from the URL and sharing token state.

## Files

| File | Description |
|------|-------------|
| `useApi.ts` | GETs a backend path with loading/error state and `reload()`, and can keep polling while a condition holds (e.g. a run is still in progress) |
| `useRepoParams.ts` | Returns `{ owner, repo }` from `/:owner/:repo/*`, usable in layout components above the repo routes |
| `useTokens.tsx` | `TokensProvider` context that loads `/tokens` once, and `useTokens()` to read or reload it |
