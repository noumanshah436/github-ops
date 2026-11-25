# github-ops backend

FastAPI service behind the github-ops UI. It stores the two GitHub tokens and calls the GitHub API
with them. The browser never receives a token: every GitHub call goes through this service.

It listens on `127.0.0.1:8765` only. It has no login of its own, so it must not be exposed to
other machines.

## Requirements

- Python 3.13 (3.12 also works)
- [uv](https://docs.astral.sh/uv/) 0.4 or newer

## Setup

```bash
cd backend
uv sync                 # creates .venv and installs runtime + dev dependencies
cp .env.example .env    # optional: you can add tokens from the UI instead
```

On this machine the `uv` on PATH is a pyenv-win shim that can fail with
`No global/local python version has been set`. Use the real binary instead:

```bash
UV=/c/Users/User.DESKTOP-KRMAU4O/.pyenv/pyenv-win/versions/3.13.13/Scripts/uv.exe
$UV sync
```

## Run

```bash
uv run python run.py            # http://127.0.0.1:8765
uv run python run.py --reload   # restart on code changes (development)
```

| What | Link |
|---|---|
| API | http://127.0.0.1:8765/api |
| Swagger | http://127.0.0.1:8765/docs (http://127.0.0.1:8765 redirects here) |
| ReDoc | http://127.0.0.1:8765/redoc |

The UI runs separately on `:5173` (see `../frontend/README.md`) and calls this API directly.
CORS allows only the origins in `GH_OPS_CORS_ORIGINS`.

## Tokens

| Env name | Kind in the API | Used for |
|---|---|---|
| `GITHUB_TOKEN` | `create` | Create PRs; read repos, branches, PRs, checks and Actions; re-run or cancel runs |
| `GITHUB_TOKEN_MERGE` | `merge` | Approve and merge PRs |

Where they come from, in order:

1. `backend/.env`. The Tokens page writes here. `PUT /api/tokens/{kind}` checks the token with
   `GET /user` before saving it.
2. An exported shell variable with the same name, e.g. `export GITHUB_TOKEN=...` before starting.

Responses only ever include a masked token (`github_p…abcd`). `backend/.env` is gitignored.

Fine-grained token permissions:

- `GITHUB_TOKEN`:
  - Pull requests: read & write
  - Contents: read
  - Actions: read (read & write to re-run or cancel)
  - Checks: read
  - Commit statuses: read
  - Without Checks or Commit statuses, PR pages still load: checks are built from Actions runs
    for the head commit, and the page says which permission to add.
  - Metadata: read
- `GITHUB_TOKEN_MERGE`:
  - Pull requests: read & write
  - Contents: read & write
  - Metadata: read
  - Use a different account from the PR author, because GitHub won't let an account approve its own PR.

## Configuration

Settings come from `GH_OPS_*` environment variables or `backend/.env` (`src/config.py`):

| Variable | Default | Meaning |
|---|---|---|
| `GH_OPS_HOST` | `127.0.0.1` | Bind address. Keep it on loopback. |
| `GH_OPS_PORT` | `8765` | Port |
| `GH_OPS_GITHUB_API_URL` | `https://api.github.com` | GitHub API base URL |
| `GH_OPS_GITHUB_TIMEOUT_SECONDS` | `30` | Timeout per GitHub request |
| `GH_OPS_TOKEN_ENV_FILE` | `backend/.env` | File the tokens are saved to |
| `GH_OPS_CORS_ORIGINS` | `["http://127.0.0.1:5173","http://localhost:5173"]` | Browser origins allowed to call the API (JSON list) |

## API

All routes are under `/api`. GitHub's error status and message are passed through, e.g.
`{"detail": "GitHub: Pull Request is not mergeable"}` with status 405.

**Tokens**

| Method | Path | Token | |
|---|---|---|---|
| GET | `/tokens` | both | Which tokens are set, their account, source and scopes |
| PUT | `/tokens/{create\|merge}` | none | Validate and save a token. Body: `{"token": "..."}` |
| DELETE | `/tokens/{create\|merge}` | none | Remove a token from `backend/.env` |

**Repositories**

| Method | Path | Token | |
|---|---|---|---|
| GET | `/repos` | create | Repos the token can see, most recently pushed first |
| GET | `/repos/{owner}/{repo}/branches` | create | Branch names |
| GET | `/repos/{owner}/{repo}/compare?base=&head=` | create | Commits and files between two branches |

**Pull requests**

| Method | Path | Token | |
|---|---|---|---|
| GET | `/repos/{owner}/{repo}/pulls?state=&head=` | create | List PRs |
| GET | `/repos/{owner}/{repo}/pulls/{n}` | create | PR, reviews, check runs, statuses and a checks summary |
| GET | `/repos/{owner}/{repo}/pulls/{n}/commits` | create | Commits |
| GET | `/repos/{owner}/{repo}/pulls/{n}/files` | create | Changed files with patches |
| GET | `/repos/{owner}/{repo}/pulls/{n}/comments` | create | Conversation comments |
| POST | `/repos/{owner}/{repo}/pulls` | create | Create a PR. Body: `{title, head, base, body, draft}` |
| POST | `/repos/{owner}/{repo}/pulls/{n}/approve` | **merge** | Approve. Body: `{"body": "LGTM"}` |
| PUT | `/repos/{owner}/{repo}/pulls/{n}/merge` | **merge** | Merge. Body: `{sha, merge_method, commit_title?, commit_message?}`. `sha` must be the reviewed head commit, or GitHub returns 409 |
| POST | `/repos/{owner}/{repo}/pulls/{n}/reviews` | **merge** | Review. Body: `{event: APPROVE\|REQUEST_CHANGES\|COMMENT, body}`; a body is required unless approving |
| GET | `/repos/{owner}/{repo}/pulls/{n}/review-comments` | create | Inline comments on diff lines |
| GET | `/repos/{owner}/{repo}/pulls/{n}/events` | create | Timeline events (closed, reopened, labeled, branch deleted…) |
| GET | `/repos/{owner}/{repo}/labels` | create | Repository labels |
| GET | `/repos/{owner}/{repo}/assignees` | create | Users who can be assigned or asked to review |
| PATCH | `/repos/{owner}/{repo}/pulls/{n}` | account | Edit or close/reopen. Body: `{title?, body?, base?, state?: open\|closed, account}` |
| POST | `/repos/{owner}/{repo}/pulls/{n}/comments` | account | Add a conversation comment. Body: `{body, account}` |
| PATCH / DELETE | `/repos/{owner}/{repo}/issues/comments/{id}` | account | Edit (`{body, account}`) or delete (`?account=`) a comment |
| POST | `/repos/{owner}/{repo}/pulls/{n}/draft` | account | `{draft: true}` converts to draft, `{draft: false}` marks ready for review (GraphQL) |
| PUT | `/repos/{owner}/{repo}/pulls/{n}/update-branch` | account | Merge the base branch into the head. Body: `{expected_head_sha?, account}` |
| PUT | `/repos/{owner}/{repo}/pulls/{n}/labels` | account | Replace the labels. Body: `{labels, account}` |
| POST | `/repos/{owner}/{repo}/pulls/{n}/assignees` | account | Body: `{add, remove, account}` |
| POST | `/repos/{owner}/{repo}/pulls/{n}/requested-reviewers` | account | Body: `{add, remove, account}` |
| DELETE / POST | `/repos/{owner}/{repo}/pulls/{n}/branch` | account | Delete (`?account=`) or restore (`{account}`) the head branch of a closed PR from this repo |

"account" means the body's `account` (or `?account=`) picks the token: `create` (default) or `merge`.
Deleting or restoring a branch and "Update branch" need **Contents: read & write** on that token.

**Actions**

| Method | Path | Token | |
|---|---|---|---|
| GET | `/repos/{owner}/{repo}/actions/workflows` | create | Workflows |
| GET | `/repos/{owner}/{repo}/actions/runs?branch=&status=&workflow=&head_sha=&per_page=` | create | Runs. `workflow` is a file name such as `deploy.yml` |
| GET | `/repos/{owner}/{repo}/actions/runs/{id}` | create | Run plus its jobs and steps |
| GET | `/repos/{owner}/{repo}/actions/jobs/{id}/logs` | create | A job's log as plain text |
| POST | `/repos/{owner}/{repo}/actions/runs/{id}/rerun-failed` | create | Re-run only the failed jobs |
| POST | `/repos/{owner}/{repo}/actions/runs/{id}/cancel` | create | Cancel a run |

## Project layout

```
backend/
├── run.py                     # starts uvicorn with host/port from settings
├── pyproject.toml             # dependencies, Ruff and pytest config
├── pyrightconfig.json
├── .env.example
├── src/
│   ├── main.py                # app, CORS, routers
│   ├── config.py              # Settings (GH_OPS_*)
│   ├── api/routes/            # tokens.py, repos.py, pulls.py, actions.py
│   ├── schemas/               # request and response models
│   ├── services/
│   │   ├── github_client.py   # httpx client, auth header, error mapping, pagination
│   │   └── token_store.py     # GITHUB_TOKEN / GITHUB_TOKEN_MERGE in backend/.env
│   └── utils/checks.py        # rolls check runs and statuses into one summary
└── tests/test_backend.py      # offline: GitHub calls are mocked
```

Imports are absolute from `src`, e.g. `from src.services.github_client import github`.

To add an endpoint:
1. Add the route to the matching file in `src/api/routes/`.
2. Call GitHub through `github.request(...)` or `github.get_json(...)`, passing `"merge"` only for
   actions that need `GITHUB_TOKEN_MERGE`.
3. Put any request or response models in `src/schemas/`.

## Checks

```bash
uv run ruff format .
uv run ruff check .
uv run pyright
uv run pytest
```

If pytest fails with `PermissionError` on its temp folder, give it a writable one:
`uv run pytest --basetemp ./.pytest_tmp`
