import { useState, type ReactNode } from "react";

import { api } from "../../api/client";
import type { Label, PullDetail, User } from "../../api/types";
import type { Account } from "../../hooks/useAccounts";
import { useAction } from "../../hooks/useAccounts";
import { useApi } from "../../hooks/useApi";
import { Avatar, CopyButton, ErrorBox } from "../common";

interface Option {
  key: string;
  label: ReactNode;
  search: string;
}

/** Sidebar section with a gear that opens a checklist; Apply sends the new selection. */
function PickerSection({
  title,
  selected,
  load,
  options,
  onApply,
  children,
  empty,
}: {
  title: string;
  selected: string[];
  load: () => void;
  options: Option[] | null;
  onApply: (next: string[]) => Promise<boolean>;
  children: ReactNode;
  empty: string;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);

  const start = () => {
    load();
    setPicked(new Set(selected));
    setFilter("");
    setOpen(true);
  };
  const apply = async () => {
    setSaving(true);
    const ok = await onApply([...picked]);
    setSaving(false);
    if (ok) setOpen(false);
  };
  const toggle = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const shown = (options ?? []).filter((o) => o.search.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="side-section">
      <div className="side-title">
        <span>{title}</span>
        <button type="button" className="link-btn" title={`Edit ${title.toLowerCase()}`} onClick={open ? () => setOpen(false) : start}>
          ⚙
        </button>
      </div>
      {open && (
        <div className="picker">
          <input className="input picker-filter" placeholder="Filter" value={filter} autoFocus onChange={(e) => setFilter(e.target.value)} />
          <div className="picker-list">
            {options === null && <p className="muted small pad">Loading…</p>}
            {options && !shown.length && <p className="muted small pad">Nothing found.</p>}
            {shown.map((o) => (
              <label key={o.key} className="picker-item">
                <input type="checkbox" checked={picked.has(o.key)} onChange={() => toggle(o.key)} />
                {o.label}
              </label>
            ))}
          </div>
          <div className="row picker-actions">
            <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-sm btn-primary" disabled={saving} onClick={() => void apply()}>
              {saving ? "Saving…" : "Apply"}
            </button>
          </div>
        </div>
      )}
      {selected.length ? children : <p className="muted small">{empty}</p>}
    </div>
  );
}

export function LabelChip({ label }: { label: { name: string; color: string } }) {
  return (
    <span className="label-chip" style={{ borderColor: `#${label.color}`, background: `#${label.color}33` }}>
      {label.name}
    </span>
  );
}

function reviewIcon(state: string | undefined) {
  if (state === "APPROVED") return <span className="status status-success" title="Approved">✔</span>;
  if (state === "CHANGES_REQUESTED") return <span className="status status-failure" title="Changes requested">±</span>;
  if (state === "COMMENTED") return <span className="status status-neutral" title="Commented">💬</span>;
  return <span className="status status-pending" title="Awaiting review">●</span>;
}

export function Sidebar({
  detail,
  base,
  repoBase,
  account,
  onChanged,
}: {
  detail: PullDetail;
  base: string;
  repoBase: string;
  account: Account | null;
  onChanged: () => void;
}) {
  const { pr, reviews } = detail;
  const [loadPeople, setLoadPeople] = useState(false);
  const [loadLabels, setLoadLabels] = useState(false);
  const { data: people } = useApi<User[]>(loadPeople ? `${repoBase}/assignees` : null);
  const { data: labels } = useApi<Label[]>(loadLabels ? `${repoBase}/labels` : null);
  const action = useAction();
  const kind = account?.kind ?? "create";
  const isOpen = pr.state === "open";

  const done = (ok: boolean) => {
    if (ok) onChanged();
    return ok;
  };
  const diff = (before: string[], after: string[]) => ({
    add: after.filter((x) => !before.includes(x)),
    remove: before.filter((x) => !after.includes(x)),
    account: kind,
  });

  // Latest review state per reviewer, plus people asked to review who haven't yet.
  const latest = new Map<string, { user: User; state?: string }>();
  for (const r of reviews) if (r.state !== "PENDING" && r.user.login !== pr.user.login) latest.set(r.user.login, { user: r.user, state: r.state });
  for (const u of pr.requested_reviewers) latest.set(u.login, { user: u });
  const requested = pr.requested_reviewers.map((u) => u.login);
  const reviewerRows = [...latest.values()];

  const peopleOptions = (exclude?: string): Option[] | null =>
    people
      ? people
          .filter((u) => u.login !== exclude)
          .map((u) => ({
            key: u.login,
            search: u.login,
            label: (
              <>
                <Avatar user={u} /> {u.login}
              </>
            ),
          }))
      : null;

  const setDraft = (draft: boolean) =>
    action.run(draft ? "draft" : "ready", () => api.post(`${base}/draft`, { draft, account: kind }).then(() => {})).then(done);
  const setState = (state: "open" | "closed") =>
    action.run(state, () => api.patch(`${base}`, { state, account: kind }).then(() => {})).then(done);
  const deleteBranch = () =>
    window.confirm(`Delete branch ${pr.head.ref}? You can restore it from this page.`) &&
    void action.run("delete-branch", () => api.del(`${base}/branch?account=${kind}`)).then(done);
  const restoreBranch = () =>
    action.run("restore-branch", () => api.post(`${base}/branch`, { account: kind }).then(() => {})).then(done);

  return (
    <aside className="sidebar">
      <PickerSection
        title="Reviewers"
        selected={reviewerRows.map((r) => r.user.login)}
        load={() => setLoadPeople(true)}
        options={peopleOptions(pr.user.login)}
        empty="No reviews"
        onApply={async (next) => {
          // Only change review requests; reviewers who already reviewed stay listed either way.
          const keep = next.filter((login) => requested.includes(login) || !latest.has(login));
          return done(await action.run("reviewers", () => api.post(`${base}/requested-reviewers`, diff(requested, keep)).then(() => {})));
        }}
      >
        <ul className="side-list">
          {reviewerRows.map((r) => (
            <li key={r.user.login}>
              <Avatar user={r.user} /> <span className="grow">{r.user.login}</span>
              {requested.includes(r.user.login) ? reviewIcon(undefined) : reviewIcon(r.state)}
            </li>
          ))}
          {pr.requested_teams.map((t) => (
            <li key={t.slug}>
              <span className="grow">@{t.slug}</span>
              {reviewIcon(undefined)}
            </li>
          ))}
        </ul>
      </PickerSection>

      <PickerSection
        title="Assignees"
        selected={pr.assignees.map((u) => u.login)}
        load={() => setLoadPeople(true)}
        options={peopleOptions()}
        empty="No one assigned"
        onApply={async (next) =>
          done(
            await action.run("assignees", () =>
              api.post(`${base}/assignees`, diff(pr.assignees.map((u) => u.login), next)).then(() => {}),
            ),
          )
        }
      >
        <ul className="side-list">
          {pr.assignees.map((u) => (
            <li key={u.login}>
              <Avatar user={u} /> {u.login}
            </li>
          ))}
        </ul>
      </PickerSection>

      <PickerSection
        title="Labels"
        selected={pr.labels.map((l) => l.name)}
        load={() => setLoadLabels(true)}
        options={
          labels
            ? labels.map((l) => ({
                key: l.name,
                search: `${l.name} ${l.description ?? ""}`,
                label: (
                  <span>
                    <LabelChip label={l} />
                    {l.description && <span className="muted small block">{l.description}</span>}
                  </span>
                ),
              }))
            : null
        }
        empty="None yet"
        onApply={async (next) =>
          done(await action.run("labels", () => api.put(`${base}/labels`, { labels: next, account: kind }).then(() => {})))
        }
      >
        <div className="wrap row">
          {pr.labels.map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
        </div>
      </PickerSection>

      <div className="side-section">
        <div className="side-title">Branch</div>
        <div className="row small">
          <span className="branch grow">{pr.head.ref}</span>
          <CopyButton text={pr.head.ref} label="Copy" title="Copy branch name" />
        </div>
      </div>

      <div className="side-section side-actions">
        {isOpen && !pr.draft && (
          <button type="button" className="link-btn" disabled={action.busy !== null} onClick={() => void setDraft(true)}>
            {action.busy === "draft" ? "Converting…" : "Convert to draft"}
          </button>
        )}
        {isOpen && pr.draft && (
          <button type="button" className="link-btn" disabled={action.busy !== null} onClick={() => void setDraft(false)}>
            {action.busy === "ready" ? "Marking…" : "Mark ready for review"}
          </button>
        )}
        {isOpen && (
          <button
            type="button"
            className="link-btn danger"
            disabled={action.busy !== null}
            onClick={() => window.confirm(`Close #${pr.number} without merging?`) && void setState("closed")}
          >
            {action.busy === "closed" ? "Closing…" : "⨯ Close pull request"}
          </button>
        )}
        {!isOpen && !pr.merged && (
          <button type="button" className="link-btn" disabled={action.busy !== null} onClick={() => void setState("open")}>
            {action.busy === "open" ? "Reopening…" : "⟲ Reopen pull request"}
          </button>
        )}
        {detail.head_branch_exists === true && (
          <button type="button" className="link-btn danger" disabled={action.busy !== null} onClick={deleteBranch}>
            {action.busy === "delete-branch" ? "Deleting…" : `🗑 Delete branch ${pr.head.ref}`}
          </button>
        )}
        {detail.head_branch_exists === false && (
          <button type="button" className="link-btn" disabled={action.busy !== null} onClick={() => void restoreBranch()}>
            {action.busy === "restore-branch" ? "Restoring…" : `⟲ Restore branch ${pr.head.ref}`}
          </button>
        )}
        {account && <p className="muted small">Actions here run as {account.login}.</p>}
      </div>
      <ErrorBox error={action.error} />
    </aside>
  );
}
