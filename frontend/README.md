# gh-ops frontend

React + TypeScript UI for gh-ops, built with Vite. It looks and works like a cut-down GitHub:
pull requests, a new-PR form, and GitHub Actions runs with logs.

The UI only talks to the gh-ops backend (`/api/*`). It never handles a GitHub token directly,
so the backend must be running.

## Requirements

- Node.js 18 or newer (tested with Node 24)
- The backend running on `127.0.0.1:8765` (see `../backend/README.md`)

## Setup

```bash
cd frontend
npm install
```

## Run

```bash
npm run dev        # http://127.0.0.1:5173
```

The app calls the backend directly at `http://127.0.0.1:8765`, so start the backend first.
If the backend runs elsewhere, set the address in `frontend/.env.local`:

```bash
VITE_API_URL=http://127.0.0.1:8766
```

| Script | Does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check with `tsc`, then build to `dist/` |
| `npm run typecheck` | Type-check only |
| `npm run preview` | Serve the built `dist/` locally |

## Screens and routes

| Route | Page | What it shows |
|---|---|---|
| `/` | `HomePage` | Opens the last repo, or the repo list. Sends you to Tokens if none are set |
| `/tokens` | `TokensPage` | Add, replace or remove `GITHUB_TOKEN` and `GITHUB_TOKEN_MERGE` |
| `/:owner/:repo/pulls` | `PullListPage` | Open, closed or all PRs |
| `/:owner/:repo/pulls/new` | `NewPullPage` | Branch pickers, title, markdown body, Load `pr_body.json`, commits and diff preview |
| `/:owner/:repo/pulls/:number` | `PullDetailPage` | Conversation, Commits, Files and Checks tabs, plus the merge box |
| `/:owner/:repo/actions` | `ActionsPage` | Runs filtered by workflow, branch, status or commit |
| `/:owner/:repo/actions/runs/:runId` | `RunDetailPage` | Jobs, steps and logs, re-run failed jobs, cancel |

Filters and tabs live in the URL (for example `?state=closed`, `?tab=files`, `?branch=staging`),
so you can bookmark or share a view.

**Auto-refresh**
- A PR page refreshes every 15s while checks are running or GitHub is still working out mergeability.
- The Actions list refreshes every 10s while any run is queued or running.
- A run page refreshes every 8s until the run finishes.

**Merge box rules**
- **Approve** uses `GITHUB_TOKEN_MERGE`. It's disabled when that account opened the PR or has
  already approved, and for drafts.
- **Merge** asks for confirmation, says how many checks failed or are still running, and sends the
  head commit SHA you were looking at.

## Project layout

```
frontend/
├── index.html
├── vite.config.ts             # dev server on :5173
├── tsconfig.json
└── src/
    ├── main.tsx               # React root and router
    ├── App.tsx                # routes
    ├── styles.css             # GitHub-like theme; light/dark follows the system setting
    ├── api/
    │   ├── client.ts          # calls the backend (VITE_API_URL); turns errors into readable messages
    │   └── types.ts           # GitHub object shapes the UI reads
    ├── hooks/
    │   ├── useApi.ts          # GET with loading/error state and optional polling
    │   ├── useTokens.tsx      # token status shared across the app
    │   └── useRepoParams.ts   # owner/repo from the URL, for the top bar
    ├── components/            # Layout, StatusIcon, Markdown, DiffView, common bits
    ├── pages/                 # one file per screen (table above)
    └── utils/                 # time and duration formatting, last-opened repo
```

**Adding a page**
1. Create it in `src/pages/`.
2. Add its route in `App.tsx`.
3. Fetch data with `useApi("/repos/...")`.
4. Call new backend endpoints through `api.get/post/put/del` from `src/api/client.ts`.

The only browser storage used is `localStorage` for the last-opened repo.
