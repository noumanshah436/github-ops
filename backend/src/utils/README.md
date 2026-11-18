# utils

Pure helpers that reshape GitHub data for the routes, with no I/O.

## Files

| File | Description |
|------|-------------|
| `__init__.py` | Empty package marker |
| `checks.py` | Rolls check runs and commit statuses into one `ChecksSummary`, and shapes Actions runs like check runs for tokens without `Checks: read` |
| `pulls.py` | Converts a GraphQL pull request node into the REST-style object the UI reads (merged PRs stay `closed` with `merged_at` set) |
