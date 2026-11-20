// Calls the gh-ops backend directly (it adds the GitHub token). Errors carry GitHub's message.
// Override the backend address with VITE_API_URL in frontend/.env.local if it isn't on :8765.
const API_URL = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const data = await response.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail)) message = data.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch {
      // keep the status text
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  const type = response.headers.get("content-type") ?? "";
  return (type.includes("application/json") ? response.json() : response.text()) as Promise<T>;
}

// Concurrent identical GETs (same path and query string) share one request and its result or error.
// Only in-flight requests are shared: once one settles, the next GET fetches fresh data.
const inflight = new Map<string, Promise<unknown>>();

function get<T>(path: string): Promise<T> {
  const pending = inflight.get(path);
  if (pending) return pending as Promise<T>;
  const request = call<T>("GET", path).finally(() => inflight.delete(path));
  inflight.set(path, request);
  return request;
}

export const api = {
  get,
  post: <T>(path: string, body: unknown = {}) => call<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => call<T>("PUT", path, body),
  del: (path: string) => call<void>("DELETE", path),
};

export function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
