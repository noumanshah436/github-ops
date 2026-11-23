# pages

Route-level screens; each one maps to a route in `App.tsx`.

## Files

| File | Description |
|------|-------------|
| `ActionsPage.tsx` | Actions run list with workflow, branch, status and commit filters, pagination, and auto-refresh while runs are active |
| `HomePage.tsx` | Sends you to Tokens if no token is set, reopens the last repo, or lists the repositories to choose from |
| `NewPullPage.tsx` | Create a PR: pick base and head (defaults to `staging` when present), preview the comparison, warn about an existing open PR, and suggest a title |
| `PullDetailPage.tsx` | PR view with Conversation, Commits, Files and Checks tabs; edit title/base, "Acting as" account picker, Review changes, and the timeline, merge box, comment box and sidebar from `components/pull`; polls for updates |
| `PullListPage.tsx` | Open/closed/all PR list with cursor-based "Load more" |
| `RunDetailPage.tsx` | One Actions run: jobs, steps and job logs (timestamps stripped), with re-run failed jobs and cancel; polls while running |
| `TokensPage.tsx` | Save, check and remove `GITHUB_TOKEN` and `GITHUB_TOKEN_MERGE`, showing the GitHub login each one belongs to |
