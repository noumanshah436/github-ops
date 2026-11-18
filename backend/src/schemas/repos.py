from typing import Any

from pydantic import BaseModel


class RepoOut(BaseModel):
    full_name: str
    private: bool
    default_branch: str
    pushed_at: str | None = None


class CompareOut(BaseModel):
    status: str
    ahead_by: int
    behind_by: int
    commits: list[dict[str, Any]]
    files: list[dict[str, Any]]
