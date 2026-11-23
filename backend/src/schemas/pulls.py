from typing import Any, Literal

from pydantic import BaseModel, Field

from src.services.token_store import TokenKind


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
    # For closed PRs from this repo: whether the head branch still exists (None when not checked).
    head_branch_exists: bool | None = None
    # For open PRs: commits on the base branch that the head branch doesn't have yet.
    behind_by: int | None = None


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
    commit_message: str | None = None


class PullPageOut(BaseModel):
    """One page of the PR list. Pass end_cursor back as ?after= for the next page."""

    items: list[dict[str, Any]]
    total_count: int
    has_next_page: bool
    end_cursor: str | None = None


class AccountIn(BaseModel):
    """Which saved token performs the action: "create" (GITHUB_TOKEN) or "merge" (GITHUB_TOKEN_MERGE)."""

    account: TokenKind = "create"


class PullUpdateIn(AccountIn):
    title: str | None = Field(default=None, min_length=1)
    body: str | None = None
    state: Literal["open", "closed"] | None = None
    base: str | None = Field(default=None, min_length=1)


class CommentIn(AccountIn):
    body: str = Field(min_length=1)


class SubmitReviewIn(BaseModel):
    """A review from GITHUB_TOKEN_MERGE. GitHub requires a body for REQUEST_CHANGES and COMMENT."""

    event: Literal["APPROVE", "REQUEST_CHANGES", "COMMENT"]
    body: str = ""


class DraftIn(AccountIn):
    draft: bool


class UpdateBranchIn(AccountIn):
    # GitHub returns 422 if the head moved since the user looked at it.
    expected_head_sha: str | None = None


class LabelsIn(AccountIn):
    labels: list[str]


class PeopleIn(AccountIn):
    """Logins to add and remove (assignees or requested reviewers)."""

    add: list[str] = Field(default_factory=list)
    remove: list[str] = Field(default_factory=list)
