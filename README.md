# gh-ops

A local web app for everyday GitHub work:
- create, approve and merge pull requests
- watch GitHub Actions runs and read their logs

It's a GUI version of `GitHub_PR_Operations_fashion_studio.md`, using the same two tokens, and it
works with any repository those tokens can see.

| Part | Tech | Docs |
|---|---|---|
| [`backend/`](backend/README.md) | Python 3.13 · FastAPI · httpx | Stores the tokens and calls the GitHub API. Serves the built UI |
| [`frontend/`](frontend/README.md) | React 18 · TypeScript · Vite | GitHub-style screens |

The browser talks only to the backend, and only the backend holds the tokens. The backend
listens on `127.0.0.1`, so it's reachable from this computer only.

## 1. Install the tools (once)

| Tool | Check | Get it |
|---|---|---|
| Node.js 18+ | `node --version` | https://nodejs.org |
| uv | `uv --version` | https://docs.astral.sh/uv/getting-started/installation/ |
| PowerShell | runs `start.ps1` | built into Windows |

uv installs Python 3.13 for the backend by itself if it's missing.

If `uv` on PATH is the pyenv-win shim and prints
`No global/local python version has been set`, use the real binary in the commands below:

```bash
export UV=/c/Users/User.DESKTOP-KRMAU4O/.pyenv/pyenv-win/versions/3.13.13/Scripts/uv.exe
```

## 2. Create the two GitHub tokens

Create fine-grained tokens at GitHub → Settings → Developer settings → Personal access tokens,
with access to the repositories you want to manage:

| Token | Account | Permissions |
|---|---|---|
| `GITHUB_TOKEN` | the account that opens PRs | Pull requests: read & write · Contents: read · Actions: read & write · Checks: read · Commit statuses: read |
| `GITHUB_TOKEN_MERGE` | a **different** account (GitHub won't let you approve your own PR) | Pull requests: read & write · Contents: read & write |

You'll paste them into the app in step 4. Nothing else needs them.

## 3. Set up (once)

```bash
cd backend && ${UV:-uv} sync && cd ..     # creates backend/.venv
cd frontend && npm install && cd ..       # creates frontend/node_modules
```

## Start

PowerShell, from `D:\Meissasoft\gh-ops`:

```powershell
.\start.ps1
```

This opens two PowerShell windows, "gh-ops backend :8765" and "gh-ops frontend :5173", both with
hot reload. Close a window (or press `Ctrl+C` in it) to stop that server.

If PowerShell says running scripts is disabled, use
`powershell -ExecutionPolicy Bypass -File .\start.ps1`.

| What | Link |
|---|---|
| App (frontend) | http://127.0.0.1:5173 |
| Backend API | http://127.0.0.1:8765/api |
| Swagger (API docs) | http://127.0.0.1:8765/docs (http://127.0.0.1:8765 redirects here) |
| ReDoc | http://127.0.0.1:8765/redoc |

The frontend calls the backend directly on `:8765`.

`start.ps1` doesn't install anything. Run step 3 again after pulling new dependencies.

## 4. Add your tokens

1. Open http://127.0.0.1:5173. With no tokens set it opens the **Tokens** page.
2. Paste `GITHUB_TOKEN` and click **Save**. The app checks it against GitHub and shows the account
   it belongs to.
3. Do the same for `GITHUB_TOKEN_MERGE`.
4. Pick a repository from the dropdown at the top.

The tokens are saved in `backend/.env`, which is gitignored. You can also write them there by
hand (see `backend/.env.example`), or `export GITHUB_TOKEN=...` in the shell before starting.

## 5. Use it

- **Pull requests:** the list, then a PR's conversation, commits, file diffs and checks.
  - The merge box shows checks, approvals and conflicts.
  - **Approve** uses `GITHUB_TOKEN_MERGE`.
  - **Merge** confirms first and only merges the commit you were looking at.
- **+ New pull request:**
  - Pick base and compare branches. The base defaults to `staging`.
  - Write the title and body, or click **Load pr_body.json**.
  - Check the commits and diff, then create.
- **Actions:**
  - Runs filtered by workflow, branch or status, refreshing on their own while anything runs.
  - Open a run to see its jobs, steps and logs, then **Re-run failed jobs** or **Cancel run**.

## Developing

`.\start.ps1` already runs both with hot reload, so edits show up straight away. To start them by
hand in two terminals instead:

```bash
cd backend && .venv/Scripts/python.exe run.py --reload    # API on :8765
cd frontend && npm run dev                                # UI on http://127.0.0.1:5173
```

Checks are listed in each part's README.

## Troubleshooting

| Problem | Fix |
|---|---|
| `No global/local python version has been set` | Use the real `uv.exe` (`export UV=...` from step 1), then `"$UV" sync` |
| Page says `No GITHUB_TOKEN (create PR) token saved` | Add it on the Tokens page |
| Token rejected with `Bad credentials` | The token is wrong, expired or revoked. Create a new one |
| `Resource not accessible by personal access token` | The token is missing a permission or that repository. See step 2 |
| Approve is greyed out | `GITHUB_TOKEN_MERGE` belongs to the PR author or has already approved |
| Merge fails with 405 | GitHub's merge rules aren't met yet, e.g. failing checks or missing reviews |
| Merge fails with 409 | New commits arrived since you opened the page. Refresh and merge again |
| App shows `Failed to fetch` | The backend isn't running on :8765. Start it, or check its terminal for errors |
| Port 8765 is in use | Set `GH_OPS_PORT=8766` in `backend/.env` and `VITE_API_URL=http://127.0.0.1:8766` in `frontend/.env.local` |
