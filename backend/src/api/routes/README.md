# routes

FastAPI routers for the `/api` endpoints, which turn browser requests into GitHub API calls through the shared client.

## Files

| File | Description |
|------|-------------|
| `__init__.py` | Empty package marker |
| `actions.py` | Actions endpoints: list workflows and paged runs, run detail with jobs, job logs, re-run failed jobs, cancel a run |
| `pulls.py` | PR endpoints: GraphQL-backed list, detail with reviews and checks (falls back to Actions runs when the token can't read checks), commits, files, comments, create, approve and merge |
| `repos.py` | Repositories the create token can see, their branch names, and base...head comparisons |
| `tokens.py` | List, save (checked against `GET /user` first) and remove the two GitHub tokens; responses only show a masked token |
