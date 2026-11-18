# services

Shared backend services: the authenticated GitHub API client and the store that holds the two GitHub tokens.

## Files

| File | Description |
|------|-------------|
| `__init__.py` | Empty package marker |
| `github_client.py` | Async httpx client for GitHub REST and GraphQL that picks the right token, turns GitHub errors into `HTTPException`s (502/504 when GitHub can't be reached) and collects paginated lists |
| `token_store.py` | Reads and writes `GITHUB_TOKEN` / `GITHUB_TOKEN_MERGE` in `backend/.env`, falls back to exported shell variables, and masks tokens for display |
