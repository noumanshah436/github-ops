# components

Reusable React components shared by the pages, including the app shell.

## Files

| File | Description |
|------|-------------|
| `common.tsx` | Small building blocks: `Avatar`, `ErrorBox` (with optional Retry), `Flash`, `Loading` and `Empty` |
| `DiffView.tsx` | Collapsible per-file unified diff with add/delete/hunk colouring; small diffs open by default |
| `Layout.tsx` | App shell: top bar with repo picker and token badge, repo tabs (Pull requests, Actions, New pull request) and the page outlet |
| `Markdown.tsx` | Renders GitHub-flavoured markdown (no raw HTML), opening links in a new tab |
| `StatusIcon.tsx` | Maps GitHub status/conclusion pairs to a tone, and renders it as an icon (`StatusIcon`) or pill (`StatusLabel`) |
