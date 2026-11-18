// Remember the last repository per browser, so the app reopens where you left off.
const KEY = "gh-ops:last-repo";

export function rememberRepo(fullName: string): void {
  try {
    localStorage.setItem(KEY, fullName);
  } catch {
    // storage unavailable: nothing to remember
  }
}

export function lastRepo(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
