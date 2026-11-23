import { useState } from "react";

import { api } from "../../api/client";
import type { Pull } from "../../api/types";
import type { Account } from "../../hooks/useAccounts";
import { useAction } from "../../hooks/useAccounts";
import { ErrorBox, Flash } from "../common";
import { MarkdownEditor } from "../MarkdownEditor";

type Event = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";

/** GitHub's "Review changes" dialog. Reviews are always sent with GITHUB_TOKEN_MERGE. */
export function ReviewPanel({ pr, base, merger, onDone, onClose }: { pr: Pull; base: string; merger: Account | null; onDone: () => void; onClose: () => void }) {
  const [body, setBody] = useState("");
  const [event, setEvent] = useState<Event>("COMMENT");
  const action = useAction();

  if (!merger) {
    return (
      <div className="box review-panel">
        <div className="box-body">
          <Flash kind="warn">Reviews are sent with GITHUB_TOKEN_MERGE. Add it under Tokens first.</Flash>
        </div>
      </div>
    );
  }
  const isAuthor = merger.login === pr.user.login;
  const needsBody = event !== "APPROVE" && !body.trim();

  const submit = async () => {
    const ok = await action.run("submit", () => api.post(`${base}/reviews`, { event, body }).then(() => {}));
    if (ok) {
      setBody("");
      onDone();
      onClose();
    }
  };

  const options: { value: Event; label: string; hint: string; disabled?: boolean }[] = [
    { value: "COMMENT", label: "Comment", hint: "Submit general feedback without explicit approval." },
    { value: "APPROVE", label: "Approve", hint: "Submit feedback and approve merging these changes.", disabled: isAuthor || pr.draft },
    { value: "REQUEST_CHANGES", label: "Request changes", hint: "Submit feedback that must be addressed before merging.", disabled: isAuthor },
  ];

  return (
    <div className="box review-panel">
      <div className="box-header row">
        <h3 className="grow">Finish your review</h3>
        <span className="muted small">as {merger.login}</span>
        <button type="button" className="link-btn" onClick={onClose} title="Close">
          ✕
        </button>
      </div>
      <div className="box-body stack">
        <MarkdownEditor value={body} onChange={setBody} onSubmit={() => !needsBody && void submit()} placeholder="Leave a review comment" autoFocus />
        {options.map((o) => (
          <label key={o.value} className={`radio-row ${o.disabled ? "muted" : ""}`} title={o.disabled && isAuthor ? `${merger.login} opened this PR` : ""}>
            <input type="radio" name="review-event" value={o.value} checked={event === o.value} disabled={o.disabled} onChange={() => setEvent(o.value)} />
            <span>
              <strong>{o.label}</strong>
              <span className="muted small block">{o.hint}</span>
            </span>
          </label>
        ))}
        <div className="row">
          <span className="spacer" />
          <button type="button" className="btn btn-primary" disabled={action.busy !== null || needsBody} title={needsBody ? "Write a comment first" : ""} onClick={() => void submit()}>
            {action.busy ? "Submitting…" : "Submit review"}
          </button>
        </div>
        <ErrorBox error={action.error} />
      </div>
    </div>
  );
}
