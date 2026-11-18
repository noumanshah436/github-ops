from typing import Any, Literal

from pydantic import BaseModel, Field


class ChecksSummary(BaseModel):
    total: int = 0
    success: int = 0
    failure: int = 0
    pending: int = 0
    skipped: int = 0


class PullDetailOut(BaseModel):
    pr: dict[str, Any]
    reviews: list[dict[str, Any]]
    check_runs: list[dict[str, Any]]
    statuses: list[dict[str, Any]]
    checks_summary: ChecksSummary
    # Set when the token lacks a permission and checks were partly or fully unavailable.
    checks_notes: list[str] = Field(default_factory=list)


class PullIn(BaseModel):
    title: str = Field(min_length=1)
    head: str = Field(min_length=1)
    base: str = Field(min_length=1)
    body: str = ""
    draft: bool = False


class ReviewIn(BaseModel):
    body: str = "LGTM"


class MergeIn(BaseModel):
    # Only merge the head commit the user reviewed; GitHub returns 409 if it moved.
    sha: str = Field(min_length=7)
    merge_method: Literal["merge", "squash", "rebase"] = "merge"
    commit_title: str | None = None


class PullPageOut(BaseModel):
    """One page of the PR list. Pass end_cursor back as ?after= for the next page."""

    items: list[dict[str, Any]]
    total_count: int
    has_next_page: bool
    end_cursor: str | None = None
