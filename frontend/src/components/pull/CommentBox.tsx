import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../api/client";
import type { Pull } from "../../api/types";
import type { Account } from "../../hooks/useAccounts";
import { useAction } from "../../hooks/useAccounts";
import { Avatar, ErrorBox } from "../common";
import { MarkdownEditor } from "../MarkdownEditor";

/** GitHub's comment box: Comment, plus Close / Reopen (with comment when text is entered). */
export function CommentBox({ pr, base, account, onDone }: { pr: Pull; base: string; account: Account | null; onDone: () => void }) {
  const [body, setBody] = useState("");
  const action = useAction();

  if (!account) {
    return (
      <p className="muted comment-box">
        Add a token under <Link to="/tokens">Tokens</Link> to comment.
      </p>
    );
  }
  const kind = account.kind;
  const text = body.trim();

  const comment = async () => {
    if (!text) return;
    const ok = await action.run("comment", () => api.post(`${base}/comments`, { body, account: kind }).then(() => {}));
    if (ok) {
      setBody("");
      onDone();
    }
  };
  const setState = async (state: "open" | "closed") => {
    if (state === "closed" && !window.confirm(`Close #${pr.number} without merging?`)) return;
    const ok = await action.run(state, async () => {
      if (text) await api.post(`${base}/comments`, { body, account: kind });
      await api.patch(base, { state, account: kind });
    });
    if (ok) {
      setBody("");
      onDone();
    }
  };

  return (
    <div className="comment-box">
      <div className="row comment-box-head">
        <Avatar user={account.user} size={28} />
        <strong>Add a comment</strong>
        <span className="muted small">as {account.login}</span>
      </div>
      <div className="box">
        <div className="box-body stack">
          <MarkdownEditor value={body} onChange={setBody} onSubmit={() => void comment()} />
          <div className="row">
            <span className="muted small grow">Markdown is supported. Ctrl+Enter to comment.</span>
            {pr.state === "open" && (
              <button type="button" className="btn btn-danger" disabled={action.busy !== null} onClick={() => void setState("closed")}>
                {action.busy === "closed" ? "Closing…" : text ? "Close with comment" : "Close pull request"}
              </button>
            )}
            {pr.state === "closed" && !pr.merged && (
              <button type="button" className="btn" disabled={action.busy !== null} onClick={() => void setState("open")}>
                {action.busy === "open" ? "Reopening…" : text ? "Reopen with comment" : "Reopen pull request"}
              </button>
            )}
            <button type="button" className="btn btn-primary" disabled={action.busy !== null || !text} onClick={() => void comment()}>
              {action.busy === "comment" ? "Commenting…" : "Comment"}
            </button>
          </div>
          <ErrorBox error={action.error} />
        </div>
      </div>
    </div>
  );
}
