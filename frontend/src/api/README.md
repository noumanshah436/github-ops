# api

The frontend's only link to the gh-ops backend: a small fetch wrapper and the TypeScript shapes of the data it returns.

## Files

| File | Description |
|------|-------------|
| `client.ts` | `api.get/post/put/del` against the backend (`VITE_API_URL`, default `http://127.0.0.1:8765`), `ApiError` carrying GitHub's message, and the `query()` string builder |
| `types.ts` | Interfaces for tokens, repos, pull requests, reviews, checks, commits, files, comments, comparisons, workflows, runs, jobs and steps (only the fields the UI reads) |
