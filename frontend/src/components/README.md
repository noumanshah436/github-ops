# components

Reusable React components shared by the pages, including the app shell.

## Files

| File | Description |
|------|-------------|
| `common.tsx` | Small building blocks: `Avatar`, `ErrorBox` (with optional Retry), `Flash`, `Loading` and `Empty` |
| `DiffView.tsx` | Collapsible per-file unified diff with add/delete/hunk colouring; small diffs open by default |
| `Layout.tsx` | App shell: top bar with repo picker and token badge, repo tabs (Pull requests, Actions, New pull request) and the page outlet |
| `MarkdownEditor.tsx` | Textarea with Write / Preview tabs; Ctrl+Enter submits |
| `pull/Timeline.tsx` | PR conversation: description, comments (edit/delete for your accounts), reviews with their inline comments, and events |
| `pull/MergeBox.tsx` | Checks / reviews / conflicts summary, Ready for review, Update branch, Approve, merge with an editable message; after closing, Delete / Restore branch |
| `pull/CommentBox.tsx` | New comment, plus Close / Reopen (with comment) |
| `pull/ReviewPanel.tsx` | "Review changes": comment, approve or request changes as `GITHUB_TOKEN_MERGE` |
| `pull/Sidebar.tsx` | Reviewers, assignees and labels pickers, branch name, convert to draft, close/reopen, delete/restore branch |
| `Markdown.tsx` | Renders GitHub-flavoured markdown (no raw HTML), opening links in a new tab |
| `StatusIcon.tsx` | Maps GitHub status/conclusion pairs to a tone, and renders it as an icon (`StatusIcon`) or pill (`StatusLabel`) |
