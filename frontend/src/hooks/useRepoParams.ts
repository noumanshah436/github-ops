import { useMatch } from "react-router-dom";

// The repo in the URL (/:owner/:repo/...). Works in layout components that sit above the repo routes.
export function useRepoParams(): { owner: string; repo: string } | null {
  const match = useMatch("/:owner/:repo/*");
  const { owner, repo } = match?.params ?? {};
  return owner && repo ? { owner, repo } : null;
}
