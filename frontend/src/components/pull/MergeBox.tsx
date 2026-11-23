import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../api/client";
import type { PullDetail } from "../../api/types";
import type { Account } from "../../hooks/useAccounts";
import { useAction } from "../../hooks/useAccounts";
import { timeAgo } from "../../utils/format";
import { ErrorBox, Flash } from "../common";
import { StatusIcon } from "../StatusIcon";

type Method = "merge" | "squash" | "rebase";

/** Shown under the timeline after a PR is merged or closed: GitHub's "Delete branch" / "Restore branch". */
function ClosedBox({ detail, base, account, onDone }: { detail: PullDetail; base: string; account: Account | null; onDone: () => void }) {
  const { pr, head_branch_exists: exists } = detail;
  const action = useAction();
  const kind = account?.kind ?? "create";
  const del = () =>
    action.run("delete", () => api.del(`${base}/branch?account=${kind}`).then(() => `Deleted ${pr.head.ref}.`)).then((ok) => ok && onDone());
  const restore = () =>
    action
      .run("restore", () => api.post(`${base}/branch`, { account: kind }).then(() => `Restored ${pr.head.ref}.`))
      .then((ok) => ok && onDone());

  return (
    <div className={`box merge-box ${pr.merged ? "merged" : "closed"}`}>
      <div className="box-body">
        <div className="row">
          <span className="grow">
            {pr.merged ? (
              <>
                <strong>Pull request successfully merged and closed</strong> by {pr.merged_by?.login} {timeAgo(pr.merged_at)} into{" "}
                <span className="mono">{pr.base.ref}</span>.
              </>
            ) : (
              <>
                <strong>Closed with unmerged commits</strong> {timeAgo(pr.closed_at)}. Reopen it from the box below or the sidebar.
              </>
            )}
            {exists === true && (
              <span className="muted block small">
                The <span className="branch">{pr.head.ref}</span> branch {pr.merged ? "can be safely deleted" : "still exists"}.
              </span>
            )}
            {exists === false && (
              <span className="muted block small">
                The <span className="branch">{pr.head.ref}</span> branch has been deleted.
              </span>
            )}
          </span>
          {exists === true && (
            <button type="button" className="btn" disabled={action.busy !== null} onClick={() => void del()}>
              {action.busy === "delete" ? "Deleting…" : "Delete branch"}
            </button>
          )}
          {exists === false && (
            <button type="button" className="btn" disabled={action.busy !== null} onClick={() => void restore()}>
              {action.busy === "restore" ? "Restoring…" : "Restore branch"}
            </button>
          )}
        </div>
        <ErrorBox error={action.error} />
        {action.notice && <Flash kind="success">{action.notice}</Flash>}
      </div>
    </div>
  );
}

export function MergeBox({
  detail,
  base,
  account,
  merger,
  onDone,
}: {
  detail: PullDetail;
  base: string;
  /** Account chosen in "Acting as": used for update branch and ready for review. */
  account: Account | null;
  /** GITHUB_TOKEN_MERGE's account: approves and merges. */
  merger: Account | null;
  onDone: () => void;
}) {
  const { pr, checks_summary: checks, reviews } = detail;
  const [method, setMethod] = useState<Method>("merge");
  const [editMessage, setEditMessage] = useState(false);
  const [commitTitle, setCommitTitle] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const action = useAction();
  const kind = account?.kind ?? "create";

  if (pr.state === "closed") return <ClosedBox detail={detail} base={base} account={account} onDone={onDone} />;

  const mergerLogin = merger?.login ?? null;
  const isAuthor = mergerLogin === pr.user.login;
  const alreadyApproved = reviews.some((r) => r.state === "APPROVED" && r.user.login === mergerLogin);
  // Latest review per person decides whether they approve or block.
  const latest = new Map<string, string>();
  for (const r of reviews) if (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED" || r.state === "DISMISSED") latest.set(r.user.login, r.state);
  const approvals = [...latest].filter(([, s]) => s === "APPROVED").map(([l]) => l);
  const blockers = [...latest].filter(([, s]) => s === "CHANGES_REQUESTED").map(([l]) => l);
  const behindBy = detail.behind_by ?? 0;
  const behind = behindBy > 0 || pr.mergeable_state === "behind";

  const defaultTitle = (m: Method) => (m === "squash" ? `${pr.title} (#${pr.number})` : `Merge pull request #${pr.number} from ${pr.head.ref}`);
  const openMessageEditor = () => {
    setCommitTitle(defaultTitle(method));
    setCommitMessage(method === "squash" ? "" : pr.title);
    setEditMessage(true);
  };

  const approve = () => action.run("approve", () => api.post(`${base}/approve`, { body: "LGTM" }).then(() => `Approved as ${mergerLogin}.`)).then((ok) => ok && onDone());
  const updateBranch = () =>
    action
      .run("update", () =>
        api.put(`${base}/update-branch`, { expected_head_sha: pr.head.sha, account: kind }).then(() => `Merging ${pr.base.ref} into ${pr.head.ref}… GitHub may take a few seconds.`),
      )
      .then((ok) => ok && onDone());
  const ready = () =>
    action.run("ready", () => api.post(`${base}/draft`, { draft: false, account: kind }).then(() => "Marked ready for review.")).then((ok) => ok && onDone());
  const merge = () =>
    action
      .run("merge", () =>
        api
          .put(`${base}/merge`, {
            sha: pr.head.sha,
            merge_method: method,
            ...(editMessage && method !== "rebase" ? { commit_title: commitTitle, commit_message: commitMessage } : {}),
          })
          .then(() => `Merged into ${pr.base.ref}.`),
      )
      .then((ok) => {
        if (ok) {
          setEditMessage(false);
          onDone();
        }
      });

  const confirmMerge = () => {
    const warnings = [
      checks.failure ? `${checks.failure} check(s) failed.` : "",
      checks.pending ? `${checks.pending} check(s) still running.` : "",
      blockers.length ? `Changes requested by ${blockers.join(", ")}.` : "",
    ].filter(Boolean);
    const message = [`Merge #${pr.number} (${pr.head.ref} → ${pr.base.ref}) with "${method}"?`, `Commit ${pr.head.sha.slice(0, 7)} as ${mergerLogin}.`, ...warnings].join("\n");
    if (window.confirm(message)) void merge();
  };

  const mergeable =
    pr.mergeable === null
      ? "GitHub is still checking whether this can merge…"
      : pr.mergeable
        ? "No conflicts with the base branch."
        : "This branch has conflicts that must be resolved on GitHub.";
  const checksText = checks.total
    ? `${checks.success} passed · ${checks.failure} failed · ${checks.pending} running${checks.skipped ? ` · ${checks.skipped} skipped` : ""}`
    : "No checks.";

  return (
    <div className="box merge-box">
      <div className="box-body">
        {pr.draft && (
          <div className="merge-row">
            <StatusIcon status="completed" conclusion="neutral" />
            <span className="grow">
              <strong>This pull request is still a work in progress.</strong> Draft pull requests cannot be merged.
            </span>
            <button type="button" className="btn" disabled={action.busy !== null || !account} onClick={() => void ready()}>
              {action.busy === "ready" ? "Marking…" : "Ready for review"}
            </button>
          </div>
        )}
        <div className="merge-row">
          <StatusIcon status={checks.pending ? "in_progress" : "completed"} conclusion={checks.failure ? "failure" : checks.total ? "success" : null} />
          <span>
            <strong>Checks:</strong> {checksText}
            {detail.checks_notes.length > 0 && <span className="muted small"> (partial, see Checks tab)</span>}
          </span>
        </div>
        <div className="merge-row">
          <StatusIcon status="completed" conclusion={blockers.length ? "failure" : approvals.length ? "success" : null} />
          <span>
            <strong>Reviews:</strong> {approvals.length ? `approved by ${approvals.join(", ")}` : "no approvals yet"}
            {blockers.length > 0 && <span className="del"> · changes requested by {blockers.join(", ")}</span>}
          </span>
        </div>
        <div className="merge-row">
          <StatusIcon status={pr.mergeable === null ? "queued" : "completed"} conclusion={pr.mergeable && !behind ? "success" : behind ? "neutral" : "failure"} />
          <span className="grow">
            {behind ? (
              <>
                <strong>This branch is {behindBy ? `${behindBy} commit${behindBy === 1 ? "" : "s"} behind` : "out-of-date with"} the base branch.</strong>{" "}
                {pr.mergeable === false ? "It also has conflicts that must be resolved on GitHub." : <>Merge the latest changes from <span className="mono">{pr.base.ref}</span> into this branch.</>}
              </>
            ) : (
              mergeable
            )}{" "}
            <span className="muted small">({pr.mergeable_state})</span>
          </span>
          {behind && pr.mergeable !== false && (
            <button
              type="button"
              className="btn"
              disabled={action.busy !== null || !account}
              title={`Merge ${pr.base.ref} into ${pr.head.ref} as ${account?.login ?? "?"}`}
              onClick={() => void updateBranch()}
            >
              {action.busy === "update" ? "Updating…" : "Update branch"}
            </button>
          )}
        </div>
        {!merger && (
          <Flash kind="warn">
            Add <code>GITHUB_TOKEN_MERGE</code> under <Link to="/tokens">Tokens</Link> to approve and merge.
          </Flash>
        )}
        {merger && (
          <>
            <div className="row merge-actions">
              <button
                type="button"
                className="btn"
                disabled={action.busy !== null || isAuthor || alreadyApproved || pr.draft}
                title={isAuthor ? `${mergerLogin} opened this PR and can't approve it` : alreadyApproved ? "Already approved" : ""}
                onClick={() => void approve()}
              >
                {action.busy === "approve" ? "Approving…" : alreadyApproved ? "✔ Approved" : `Approve as ${mergerLogin}`}
              </button>
              <span className="spacer" />
              <select
                className="input"
                value={method}
                onChange={(e) => {
                  const next = e.target.value as Method;
                  setMethod(next);
                  if (editMessage) setCommitTitle(defaultTitle(next));
                }}
              >
                <option value="merge">Create a merge commit</option>
                <option value="squash">Squash and merge</option>
                <option value="rebase">Rebase and merge</option>
              </select>
              {method !== "rebase" && !editMessage && (
                <button type="button" className="btn" disabled={pr.draft} onClick={openMessageEditor}>
                  Edit message…
                </button>
              )}
              <button type="button" className="btn btn-merge" disabled={action.busy !== null || pr.mergeable === false || pr.draft} onClick={confirmMerge}>
                {action.busy === "merge" ? "Merging…" : method === "squash" ? "Squash and merge" : method === "rebase" ? "Rebase and merge" : "Merge pull request"}
              </button>
            </div>
            {editMessage && method !== "rebase" && (
              <div className="stack commit-editor">
                <input className="input" value={commitTitle} onChange={(e) => setCommitTitle(e.target.value)} placeholder="Commit title" />
                <textarea className="input mono" rows={4} value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} placeholder="Extended description (optional)" />
                <div className="row">
                  <span className="muted small grow">Used when you click {method === "squash" ? "Squash and merge" : "Merge pull request"}.</span>
                  <button type="button" className="btn btn-sm" onClick={() => setEditMessage(false)}>
                    Use default message
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {isAuthor && <p className="muted small">GITHUB_TOKEN_MERGE belongs to the PR author, so it can merge but not approve.</p>}
        <ErrorBox error={action.error} />
        {action.notice && <Flash kind="success">{action.notice}</Flash>}
      </div>
    </div>
  );
}
