import { useEffect, useState, type ReactNode } from "react";

import { api } from "../../api/client";
import type { Comment, IssueEvent, PullDetail, ReviewComment, User } from "../../api/types";
import type { Account } from "../../hooks/useAccounts";
import { useAction } from "../../hooks/useAccounts";
import { useApi } from "../../hooks/useApi";
import { timeAgo } from "../../utils/format";
import { Avatar, ErrorBox } from "../common";
import { Markdown } from "../Markdown";
import { MarkdownEditor } from "../MarkdownEditor";
import { LabelChip } from "./Sidebar";

const REVIEW_TEXT: Record<string, string> = {
  APPROVED: "approved these changes",
  CHANGES_REQUESTED: "requested changes",
  COMMENTED: "reviewed",
  DISMISSED: "had a review dismissed",
};

function eventText(e: IssueEvent): ReactNode | null {
  const sha = e.commit_id ? <span className="mono"> {e.commit_id.slice(0, 7)}</span> : null;
  switch (e.event) {
    case "closed":
      return "closed this";
    case "reopened":
      return "reopened this";
    case "merged":
      return <>merged commit{sha}</>;
    case "head_ref_deleted":
      return "deleted the head branch";
    case "head_ref_restored":
      return "restored the head branch";
    case "head_ref_force_pushed":
      return "force-pushed the head branch";
    case "ready_for_review":
      return "marked this pull request as ready for review";
    case "convert_to_draft":
      return "marked this pull request as draft";
    case "review_requested":
      return <>requested a review from <strong>{e.requested_reviewer?.login ?? `@${e.requested_team?.slug}`}</strong></>;
    case "review_request_removed":
      return <>removed the review request for <strong>{e.requested_reviewer?.login ?? `@${e.requested_team?.slug}`}</strong></>;
    case "review_dismissed":
      return "dismissed a review";
    case "labeled":
      return e.label ? <>added the <LabelChip label={e.label} /> label</> : "added a label";
    case "unlabeled":
      return e.label ? <>removed the <LabelChip label={e.label} /> label</> : "removed a label";
    case "assigned":
      return <>assigned <strong>{e.assignee?.login}</strong></>;
    case "unassigned":
      return <>unassigned <strong>{e.assignee?.login}</strong></>;
    case "renamed":
      return e.rename ? <>changed the title <del>{e.rename.from}</del> {e.rename.to}</> : "changed the title";
    case "base_ref_changed":
      return "changed the base branch";
    case "locked":
      return "locked the conversation";
    case "unlocked":
      return "unlocked the conversation";
    default:
      return null;
  }
}

/** A comment card. With `onSave`, shows Edit; with `onDelete`, shows Delete. */
function CommentCard({
  user,
  verb,
  at,
  body,
  className = "",
  onSave,
  onDelete,
  editedAt,
  children,
}: {
  user: User | null;
  verb: string;
  at: string;
  body: string | null;
  className?: string;
  onSave?: (body: string) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
  editedAt?: string;
  children?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) setEditing(false);
  };
  return (
    <div className={`comment ${className}`}>
      <div className="comment-header row">
        <Avatar user={user} /> <strong>{user?.login ?? "ghost"}</strong>
        <span className="muted">
          {verb} {timeAgo(at)}
          {editedAt && editedAt !== at && <span title={`Edited ${timeAgo(editedAt)}`}> · edited</span>}
        </span>
        <span className="spacer" />
        {onSave && !editing && (
          <button
            type="button"
            className="link-btn small"
            onClick={() => {
              setDraft(body ?? "");
              setEditing(true);
            }}
          >
            Edit
          </button>
        )}
        {onDelete && !editing && (
          <button type="button" className="link-btn small danger" onClick={() => window.confirm("Delete this comment?") && void onDelete()}>
            Delete
          </button>
        )}
      </div>
      {editing ? (
        <div className="comment-body stack pad-y">
          <MarkdownEditor value={draft} onChange={setDraft} onSubmit={() => void save()} autoFocus />
          <div className="row">
            <span className="spacer" />
            <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-sm btn-primary" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Update comment"}
            </button>
          </div>
        </div>
      ) : (
        (body?.trim() || verb === "opened") && (
          <div className="comment-body">
            <Markdown text={body} />
          </div>
        )
      )}
      {children}
    </div>
  );
}

function InlineComments({ comments }: { comments: ReviewComment[] }) {
  if (!comments.length) return null;
  return (
    <div className="inline-comments">
      {comments.map((c) => (
        <div key={c.id} className="inline-comment">
          <div className="small">
            <span className="mono">{c.path}</span>
            {(c.line ?? c.original_line) && <span className="muted"> line {c.line ?? c.original_line}</span>}
            {c.line === null && <span className="pill pill-neutral">outdated</span>}
          </div>
          <pre className="hunk">{c.diff_hunk.split("\n").slice(-4).join("\n")}</pre>
          <div className="row small">
            <Avatar user={c.user} size={16} /> <strong>{c.user.login}</strong>
            <span className="muted">{timeAgo(c.created_at)}</span>
            <a href={c.html_url} target="_blank" rel="noreferrer" className="spacer-left">
              Reply on GitHub ↗
            </a>
          </div>
          <Markdown text={c.body} />
        </div>
      ))}
    </div>
  );
}

export function Timeline({
  detail,
  base,
  repoBase,
  account,
  accounts,
  refreshKey,
  onChanged,
}: {
  detail: PullDetail;
  base: string;
  repoBase: string;
  account: Account | null;
  accounts: Account[];
  refreshKey: number;
  onChanged: () => void;
}) {
  const { pr } = detail;
  const comments = useApi<Comment[]>(`${base}/comments`);
  const reviewComments = useApi<ReviewComment[]>(`${base}/review-comments`);
  const events = useApi<IssueEvent[]>(`${base}/events`);
  const action = useAction();
  const { reload: reloadComments } = comments;
  const { reload: reloadReviewComments } = reviewComments;
  const { reload: reloadEvents } = events;

  useEffect(() => {
    if (refreshKey === 0) return;
    reloadComments();
    reloadReviewComments();
    reloadEvents();
  }, [refreshKey, reloadComments, reloadReviewComments, reloadEvents]);

  // A comment can be edited or deleted with the token of the account that wrote it.
  const ownerKind = (login: string) => accounts.find((a) => a.login === login)?.kind;

  const byReview = new Map<number, ReviewComment[]>();
  for (const c of reviewComments.data ?? []) {
    if (c.pull_request_review_id == null) continue;
    byReview.set(c.pull_request_review_id, [...(byReview.get(c.pull_request_review_id) ?? []), c]);
  }

  const items: { key: string; at: string; node: ReactNode }[] = [
    ...detail.reviews
      .filter((r) => r.state !== "PENDING")
      .map((r) => ({
        key: `r${r.id}`,
        at: r.submitted_at,
        node: (
          <CommentCard
            user={r.user}
            verb={REVIEW_TEXT[r.state] ?? r.state.toLowerCase()}
            at={r.submitted_at}
            body={r.body}
            className={r.state === "APPROVED" ? "approved" : r.state === "CHANGES_REQUESTED" ? "changes" : ""}
          >
            <InlineComments comments={byReview.get(r.id) ?? []} />
          </CommentCard>
        ),
      })),
    ...(comments.data ?? []).map((c) => {
      const kind = ownerKind(c.user.login);
      return {
        key: `c${c.id}`,
        at: c.created_at,
        node: (
          <CommentCard
            user={c.user}
            verb="commented"
            at={c.created_at}
            editedAt={c.updated_at}
            body={c.body}
            onSave={
              kind &&
              ((body: string) =>
                action
                  .run("edit", () => api.patch(`${repoBase}/issues/comments/${c.id}`, { body, account: kind }).then(() => {}))
                  .then((ok) => (ok && reloadComments(), ok)))
            }
            onDelete={
              kind &&
              (() =>
                action
                  .run("delete", () => api.del(`${repoBase}/issues/comments/${c.id}?account=${kind}`))
                  .then((ok) => (ok && reloadComments(), ok)))
            }
          />
        ),
      };
    }),
    ...(events.data ?? []).flatMap((e) => {
      const text = eventText(e);
      if (!text) return [];
      return [
        {
          key: `e${e.id}`,
          at: e.created_at,
          node: (
            <div className={`event event-${e.event}`}>
              <Avatar user={e.actor} size={16} /> <strong>{e.actor?.login ?? "ghost"}</strong> {text}{" "}
              <span className="muted">{timeAgo(e.created_at)}</span>
            </div>
          ),
        },
      ];
    }),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="timeline">
      <CommentCard
        user={pr.user}
        verb="opened"
        at={pr.created_at}
        body={pr.body}
        onSave={
          account
            ? (body: string) =>
                action.run("description", () => api.patch(base, { body, account: account.kind }).then(() => {})).then((ok) => {
                  if (ok) onChanged();
                  return ok;
                })
            : undefined
        }
      />
      {items.map((item) => (
        <div key={item.key}>{item.node}</div>
      ))}
      <ErrorBox error={action.error ?? comments.error ?? events.error} />
    </div>
  );
}
