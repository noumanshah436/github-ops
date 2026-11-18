"""Pull requests: list, detail, commits, files, comments, create, approve and merge.

Approve and merge use the "merge" token (GITHUB_TOKEN_MERGE); everything else uses the "create" token (GITHUB_TOKEN).
"""

import asyncio
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Query

from src.schemas.pulls import MergeIn, PullDetailOut, PullIn, PullPageOut, ReviewIn
from src.services.github_client import github
from src.utils.checks import actions_runs_as_check_runs, summarize_checks
from src.utils.pulls import pull_summary_from_graphql

router = APIRouter(prefix="/repos/{owner}/{repo}", tags=["pulls"])


# GraphQL, not REST: REST's list sends full head/base repository objects for every PR and took
# ~1s per PR on large repos (57s for 50); this asks only for the fields the list shows.
LIST_PULLS_QUERY = """
query($owner: String!, $name: String!, $states: [PullRequestState!], $head: String, $first: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: $states, headRefName: $head, first: $first, after: $after,
                 orderBy: {field: UPDATED_AT, direction: DESC}) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        number title state isDraft mergedAt createdAt updatedAt url
        headRefName headRefOid baseRefName
        author { login avatarUrl }
      }
    }
  }
}
"""
STATES = {"open": ["OPEN"], "closed": ["CLOSED", "MERGED"], "all": None}


@router.get("/pulls")
async def list_pulls(
    owner: str,
    repo: str,
    state: Literal["open", "closed", "all"] = "open",
    head: str | None = None,
    after: str | None = None,
    per_page: Annotated[int, Query(ge=1, le=100)] = 25,
) -> PullPageOut:
    data = await github.graphql(
        LIST_PULLS_QUERY,
        {
            "owner": owner,
            "name": repo,
            "states": STATES[state],
            "head": head,
            "first": per_page,
            "after": after,
        },
    )
    if not data.get("repository"):
        raise HTTPException(404, f"Repository {owner}/{repo} not found or not visible to GITHUB_TOKEN.")
    page = data["repository"]["pullRequests"]
    return PullPageOut(
        items=[pull_summary_from_graphql(node) for node in page["nodes"]],
        total_count=page["totalCount"],
        has_next_page=page["pageInfo"]["hasNextPage"],
        end_cursor=page["pageInfo"]["endCursor"],
    )


async def _optional(path: str, **params: Any) -> tuple[Any, str | None]:
    """GET that tolerates a missing token permission: (data, None) or (None, GitHub's message)."""
    try:
        return await github.get_json(path, **params), None
    except HTTPException as exc:
        if exc.status_code in (403, 404):
            return None, str(exc.detail)
        raise


@router.get("/pulls/{number}")
async def get_pull(owner: str, repo: str, number: int) -> PullDetailOut:
    base = f"/repos/{owner}/{repo}"
    pr = await github.get_json(f"{base}/pulls/{number}")
    sha = pr["head"]["sha"]
    reviews, (checks, checks_error), (status, status_error) = await asyncio.gather(
        github.get_json(f"{base}/pulls/{number}/reviews", per_page=100),
        _optional(f"{base}/commits/{sha}/check-runs", per_page=100),
        _optional(f"{base}/commits/{sha}/status"),
    )
    notes: list[str] = []
    if checks is not None:
        check_runs = checks["check_runs"]
    else:
        # Fine-grained tokens without "Checks: read" can't list check runs, but Actions runs
        # for the same commit carry the same pass/fail information for GitHub Actions checks.
        runs, runs_error = await _optional(f"{base}/actions/runs", head_sha=sha, per_page=100)
        check_runs = actions_runs_as_check_runs(runs["workflow_runs"]) if runs else []
        notes.append(
            'GITHUB_TOKEN can\'t read check runs (add "Checks: read"), so these come from Actions runs.'
            if runs
            else f"Checks unavailable: {checks_error}; Actions runs unavailable: {runs_error}"
        )
    statuses = status.get("statuses", []) if status else []
    if status_error:
        notes.append('GITHUB_TOKEN can\'t read commit statuses (add "Commit statuses: read").')
    return PullDetailOut(
        pr=pr,
        reviews=reviews,
        check_runs=check_runs,
        statuses=statuses,
        checks_summary=summarize_checks(check_runs, statuses),
        checks_notes=notes,
    )


@router.get("/pulls/{number}/commits")
async def pull_commits(owner: str, repo: str, number: int) -> Any:
    return await github.get_pages(f"/repos/{owner}/{repo}/pulls/{number}/commits", max_pages=3)


@router.get("/pulls/{number}/files")
async def pull_files(owner: str, repo: str, number: int) -> Any:
    return await github.get_pages(f"/repos/{owner}/{repo}/pulls/{number}/files", max_pages=30)


@router.get("/pulls/{number}/comments")
async def pull_comments(owner: str, repo: str, number: int) -> Any:
    # Conversation comments live on the PR's issue.
    return await github.get_pages(f"/repos/{owner}/{repo}/issues/{number}/comments", max_pages=3)


@router.post("/pulls", status_code=201)
async def create_pull(owner: str, repo: str, body: PullIn) -> Any:
    response = await github.request("POST", f"/repos/{owner}/{repo}/pulls", "create", json=body.model_dump())
    return response.json()


@router.post("/pulls/{number}/approve")
async def approve_pull(owner: str, repo: str, number: int, body: ReviewIn) -> Any:
    response = await github.request(
        "POST",
        f"/repos/{owner}/{repo}/pulls/{number}/reviews",
        "merge",
        json={"event": "APPROVE", "body": body.body},
    )
    return response.json()


@router.put("/pulls/{number}/merge")
async def merge_pull(owner: str, repo: str, number: int, body: MergeIn) -> Any:
    response = await github.request(
        "PUT",
        f"/repos/{owner}/{repo}/pulls/{number}/merge",
        "merge",
        json=body.model_dump(exclude_none=True),
    )
    return response.json()
