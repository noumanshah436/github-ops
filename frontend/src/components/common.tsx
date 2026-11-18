import type { ReactNode } from "react";

import type { User } from "../api/types";

export function Avatar({ user, size = 20 }: { user: User | null | undefined; size?: number }) {
  if (!user) return null;
  return <img className="avatar" src={user.avatar_url} alt="" width={size} height={size} />;
}

export function ErrorBox({ error, onRetry }: { error: string | null; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="flash flash-error" role="alert">
      <span>{error}</span>
      {onRetry && (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Flash({ kind, children }: { kind: "success" | "error" | "warn"; children: ReactNode }) {
  return (
    <div className={`flash flash-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Loading({ what = "Loading" }: { what?: string }) {
  return <p className="muted loading">{what}…</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
