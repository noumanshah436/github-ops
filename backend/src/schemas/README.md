# schemas

Pydantic models for API request bodies and responses; GitHub objects the UI reads are passed through as plain dicts.

## Files

| File | Description |
|------|-------------|
| `__init__.py` | Empty package marker |
| `actions.py` | `RunDetailOut` (run plus jobs) and `RunPageOut` (one page of workflow runs with `last_page`) |
| `pulls.py` | `PullIn`, `ReviewIn`, `MergeIn` (merges only the reviewed head `sha`), `PullDetailOut`, `ChecksSummary` and the cursor-paged `PullPageOut` |
| `repos.py` | `RepoOut` (name, visibility, default branch, last push) and `CompareOut` (ahead/behind, commits, files) |
| `tokens.py` | `TokenIn`, `TokenInfo` (masked token, source, GitHub login or error) and `TokensOut` for both tokens |
