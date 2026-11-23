"""Pull requests: list, detail, commits, files, comments, events, create, edit, close/reopen,
draft/ready, comment, review, approve, merge, update branch, labels, assignees, reviewers and
deleting or restoring the head branch.

Reviews, approve and merge use the "merge" token (GITHUB_TOKEN_MERGE). Reads use the "create"
token (GITHUB_TOKEN). Other writes take an `account` ("create" by default) so the UI can choose
which saved account acts.
"""

import asyncio
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Query

from src.schemas.pulls import (
    AccountIn,
    CommentIn,
    DraftIn,
    LabelsIn,
    MergeIn,
    PeopleIn,
    PullDetailOut,
    PullIn,
    PullPageOut,
    PullUpdateIn,
    ReviewIn,
    SubmitReviewIn,
    UpdateBranchIn,
)
from src.services.github_client import github
from src.services.token_store import TokenKind
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
    """List pull requests, most recently updated first.

    Uses **GraphQL** rather than REST: REST sends full repository objects for every PR and was
    very slow on large repositories. To get the next page, pass `end_cursor` back as `after`.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - state (str, optional): Query. `open` (default), `closed` (includes merged) or `all`.
    - head (str, optional): Query. Only PRs whose head branch has this name.
    - after (str, optional): Query. Cursor from the previous page's `end_cursor`.
    - per_page (int, optional): Query. PRs per page, 1 to 100. Defaults to 25.

    Returns:

    - PullPageOut: `items` (PR summaries), `total_count`, `has_next_page` and `end_cursor`.

    Raises:

    - HTTPException: HTTP 404 if the repository doesn't exist or `GITHUB_TOKEN` can't see it;
        HTTP 422 for an invalid state or page size; otherwise any status GitHub returns, with
        GitHub's message (e.g. HTTP 403 for a missing token permission, HTTP 404 if not found);
        HTTP 400 if the token isn't saved; HTTP 502/504 if GitHub can't be reached.

    """
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
        raise HTTPException(
            404, f"Repository {owner}/{repo} not found or not visible to GITHUB_TOKEN."
        )
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
    """Get a pull request with everything the PR page needs.

    - **pr**: title, body, branches, mergeability, labels, assignees and requested reviewers.
    - **reviews**: every submitted review.
    - **checks**: check runs and commit statuses for the head commit, with a pass/fail summary.
    - **behind_by**: for open PRs, commits on the base branch the head doesn't have yet.
    - **head_branch_exists**: for closed PRs from this repository, whether the head branch still
        exists.

    If `GITHUB_TOKEN` can't read check runs, Actions runs for the same commit are used instead
    and `checks_notes` says which permission to add.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.

    Returns:

    - PullDetailOut: `pr`, `reviews`, `check_runs`, `statuses`, `checks_summary`,
        `checks_notes`, `head_branch_exists` and `behind_by`.

    Raises:

    - HTTPException: Any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a
        missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved;
        HTTP 502/504 if GitHub can't be reached.

    """
    base = f"/repos/{owner}/{repo}"
    pr = await github.get_json(f"{base}/pulls/{number}")
    sha = pr["head"]["sha"]
    is_open = pr["state"] == "open"
    (
        reviews,
        (checks, checks_error),
        (status, status_error),
        (compare, _),
    ) = await asyncio.gather(
        github.get_json(f"{base}/pulls/{number}/reviews", per_page=100),
        _optional(f"{base}/commits/{sha}/check-runs", per_page=100),
        _optional(f"{base}/commits/{sha}/status"),
        # How far the head is behind the base, for GitHub's "Update branch" button.
        (
            _optional(
                f"{base}/compare/{pr['base']['ref']}...{pr['head']['label']}",
                per_page=1,
            )
            if is_open
            else _none()
        ),
    )
    notes: list[str] = []
    if checks is not None:
        check_runs = checks["check_runs"]
    else:
        # Fine-grained tokens without "Checks: read" can't list check runs, but Actions runs
        # for the same commit carry the same pass/fail information for GitHub Actions checks.
        runs, runs_error = await _optional(
            f"{base}/actions/runs", head_sha=sha, per_page=100
        )
        check_runs = actions_runs_as_check_runs(runs["workflow_runs"]) if runs else []
        notes.append(
            'GITHUB_TOKEN can\'t read check runs (add "Checks: read"), so these come from Actions runs.'
            if runs
            else f"Checks unavailable: {checks_error}; Actions runs unavailable: {runs_error}"
        )
    statuses = status.get("statuses", []) if status else []
    if status_error:
        notes.append(
            'GITHUB_TOKEN can\'t read commit statuses (add "Commit statuses: read").'
        )
    head_branch_exists = None
    if pr["state"] == "closed" and _head_in_repo(pr, owner, repo):
        ref, _ = await _optional(f"{base}/git/ref/heads/{pr['head']['ref']}")
        head_branch_exists = ref is not None
    return PullDetailOut(
        pr=pr,
        reviews=reviews,
        check_runs=check_runs,
        statuses=statuses,
        checks_summary=summarize_checks(check_runs, statuses),
        checks_notes=notes,
        head_branch_exists=head_branch_exists,
        behind_by=compare.get("behind_by") if compare else None,
    )


async def _none() -> tuple[None, None]:
    return None, None


def _head_in_repo(pr: dict[str, Any], owner: str, repo: str) -> bool:
    """True when the head branch lives in this repository (not a fork, not deleted with its fork)."""
    head_repo = pr["head"].get("repo") or {}
    return str(head_repo.get("full_name", "")).lower() == f"{owner}/{repo}".lower()


@router.get("/pulls/{number}/commits")
async def pull_commits(owner: str, repo: str, number: int) -> Any:
    """List the PR's commits, oldest first. Reads at most **300** commits.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.

    Returns:

    - list[dict]: GitHub commit objects.

    Raises:

    - HTTPException: Any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a
        missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved;
        HTTP 502/504 if GitHub can't be reached.

    """
    return await github.get_pages(
        f"/repos/{owner}/{repo}/pulls/{number}/commits", max_pages=3
    )


@router.get("/pulls/{number}/files")
async def pull_files(owner: str, repo: str, number: int) -> Any:
    """List the PR's changed files with their **patches**.

    Reads at most **3,000** files. GitHub omits `patch` for very large or binary files.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.

    Returns:

    - list[dict]: Files with `filename`, `status`, `additions`, `deletions` and `patch`.

    Raises:

    - HTTPException: Any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a
        missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved;
        HTTP 502/504 if GitHub can't be reached.

    """
    return await github.get_pages(
        f"/repos/{owner}/{repo}/pulls/{number}/files", max_pages=30
    )


@router.get("/pulls/{number}/comments")
async def pull_comments(owner: str, repo: str, number: int) -> Any:
    """List the PR's **conversation** comments, oldest first.

    These live on the PR's issue. Inline comments on the diff come from `GET
    /pulls/{number}/review-comments`.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.

    Returns:

    - list[dict]: GitHub issue comment objects.

    Raises:

    - HTTPException: Any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a
        missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved;
        HTTP 502/504 if GitHub can't be reached.

    """
    return await github.get_pages(
        f"/repos/{owner}/{repo}/issues/{number}/comments", max_pages=3
    )


@router.get("/pulls/{number}/review-comments")
async def pull_review_comments(owner: str, repo: str, number: int) -> Any:
    """List **inline** review comments on lines of the diff.

    Each has `path`, `line`, `diff_hunk` and `pull_request_review_id`, so it can be shown under
    its review.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.

    Returns:

    - list[dict]: GitHub review comment objects.

    Raises:

    - HTTPException: Any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a
        missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved;
        HTTP 502/504 if GitHub can't be reached.

    """
    return await github.get_pages(
        f"/repos/{owner}/{repo}/pulls/{number}/comments", max_pages=3
    )


@router.get("/pulls/{number}/events")
async def pull_events(owner: str, repo: str, number: int) -> Any:
    """List the PR's **timeline events**.

    For example `closed`, `reopened`, `merged`, `labeled`, `assigned`, `renamed`,
    `review_requested`, `ready_for_review` and `head_ref_deleted`.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.

    Returns:

    - list[dict]: GitHub issue event objects with `event`, `actor` and `created_at`.

    Raises:

    - HTTPException: Any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a
        missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved;
        HTTP 502/504 if GitHub can't be reached.

    """
    return await github.get_pages(
        f"/repos/{owner}/{repo}/issues/{number}/events", max_pages=3
    )


@router.get("/labels")
async def list_labels(owner: str, repo: str) -> Any:
    """List the repository's labels, for the PR **Labels** picker.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.

    Returns:

    - list[dict]: Labels with `name`, `color` and `description`.

    Raises:

    - HTTPException: Any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a
        missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved;
        HTTP 502/504 if GitHub can't be reached.

    """
    return await github.get_pages(f"/repos/{owner}/{repo}/labels", max_pages=3)


@router.get("/assignees")
async def list_assignees(owner: str, repo: str) -> Any:
    """List users who can be **assigned** to PRs, and usually asked to **review** them.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.

    Returns:

    - list[dict]: GitHub user objects with `login` and `avatar_url`.

    Raises:

    - HTTPException: Any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a
        missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved;
        HTTP 502/504 if GitHub can't be reached.

    """
    return await github.get_pages(f"/repos/{owner}/{repo}/assignees", max_pages=3)


@router.post("/pulls", status_code=201)
async def create_pull(owner: str, repo: str, body: PullIn) -> Any:
    """Create a pull request with `GITHUB_TOKEN`.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - body (PullIn): JSON body with `title`, `head`, `base`, and optional `body` (markdown) and
        `draft`.

    Returns:

    - dict: HTTP 201 with the new GitHub pull request.

    Raises:

    - HTTPException: HTTP 422 if the branches are invalid, have no differences, or already have
        an open PR; otherwise any status GitHub returns, with GitHub's message (e.g. HTTP 403
        for a missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't
        saved; HTTP 502/504 if GitHub can't be reached.

    """
    response = await github.request(
        "POST", f"/repos/{owner}/{repo}/pulls", "create", json=body.model_dump()
    )
    return response.json()


@router.post("/pulls/{number}/approve")
async def approve_pull(owner: str, repo: str, number: int, body: ReviewIn) -> Any:
    """Approve a pull request with **`GITHUB_TOKEN_MERGE`**.

    GitHub doesn't let a PR's author approve it, so this token usually belongs to a second
    account.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.
    - body (ReviewIn): JSON body with the review comment `body`, `LGTM` by default.

    Returns:

    - dict: The submitted GitHub review.

    Raises:

    - HTTPException: HTTP 422 if the token's account opened the PR; otherwise any status GitHub
        returns, with GitHub's message (e.g. HTTP 403 for a missing token permission, HTTP 404
        if not found); HTTP 400 if the token isn't saved; HTTP 502/504 if GitHub can't be
        reached.

    """
    response = await github.request(
        "POST",
        f"/repos/{owner}/{repo}/pulls/{number}/reviews",
        "merge",
        json={"event": "APPROVE", "body": body.body},
    )
    return response.json()


@router.put("/pulls/{number}/merge")
async def merge_pull(owner: str, repo: str, number: int, body: MergeIn) -> Any:
    """Merge a pull request with **`GITHUB_TOKEN_MERGE`**.

    Only the head commit you reviewed is merged: if the branch moved since, GitHub refuses.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.
    - body (MergeIn): JSON body with `sha` (the reviewed head commit), `merge_method` (`merge`,
        `squash` or `rebase`), and optional `commit_title` and `commit_message`.

    Returns:

    - dict: GitHub's merge result with `sha`, `merged` and `message`.

    Raises:

    - HTTPException: HTTP 405 if the PR can't be merged (checks, reviews or conflicts); HTTP 409
        if the head moved; otherwise any status GitHub returns, with GitHub's message (e.g. HTTP
        403 for a missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't
        saved; HTTP 502/504 if GitHub can't be reached.

    """
    response = await github.request(
        "PUT",
        f"/repos/{owner}/{repo}/pulls/{number}/merge",
        "merge",
        json=body.model_dump(exclude_none=True),
    )
    return response.json()


@router.patch("/pulls/{number}")
async def update_pull(owner: str, repo: str, number: int, body: PullUpdateIn) -> Any:
    """Edit a pull request, or **close** or **reopen** it.

    Send only the fields to change:

    - **title**: new title.
    - **body**: new description (markdown).
    - **base**: retarget the PR to another branch.
    - **state**: `closed` to close without merging, `open` to reopen.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.
    - body (PullUpdateIn): JSON body with any of `title`, `body`, `base` and `state`, and
        `account`: which saved token acts, `create` (`GITHUB_TOKEN`, default) or `merge`
        (`GITHUB_TOKEN_MERGE`).

    Returns:

    - dict: The updated GitHub pull request.

    Raises:

    - HTTPException: HTTP 422 if nothing was given to change or GitHub rejects a value;
        otherwise any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a missing
        token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved; HTTP
        502/504 if GitHub can't be reached.

    """
    changes = body.model_dump(exclude_none=True, exclude={"account"})
    if not changes:
        raise HTTPException(422, "Nothing to change.")
    response = await github.request(
        "PATCH", f"/repos/{owner}/{repo}/pulls/{number}", body.account, json=changes
    )
    return response.json()


@router.post("/pulls/{number}/comments", status_code=201)
async def add_comment(owner: str, repo: str, number: int, body: CommentIn) -> Any:
    """Add a comment to the PR **conversation**.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.
    - body (CommentIn): JSON body with the comment `body` (markdown), and `account`: which saved
        token acts, `create` (`GITHUB_TOKEN`, default) or `merge` (`GITHUB_TOKEN_MERGE`).

    Returns:

    - dict: HTTP 201 with the new GitHub issue comment.

    Raises:

    - HTTPException: HTTP 422 for an empty comment; otherwise any status GitHub returns, with
        GitHub's message (e.g. HTTP 403 for a missing token permission, HTTP 404 if not found);
        HTTP 400 if the token isn't saved; HTTP 502/504 if GitHub can't be reached.

    """
    response = await github.request(
        "POST",
        f"/repos/{owner}/{repo}/issues/{number}/comments",
        body.account,
        json={"body": body.body},
    )
    return response.json()


@router.patch("/issues/comments/{comment_id}")
async def edit_comment(owner: str, repo: str, comment_id: int, body: CommentIn) -> Any:
    """Edit a conversation comment.

    Use the token of the account that **wrote** the comment, or one with write access to the
    repository.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - comment_id (int): Path. Issue comment ID.
    - body (CommentIn): JSON body with the new comment `body` (markdown), and `account`: which
        saved token acts, `create` (`GITHUB_TOKEN`, default) or `merge` (`GITHUB_TOKEN_MERGE`).

    Returns:

    - dict: The updated GitHub issue comment.

    Raises:

    - HTTPException: HTTP 403 if the account can't edit this comment; otherwise any status
        GitHub returns, with GitHub's message (e.g. HTTP 403 for a missing token permission,
        HTTP 404 if not found); HTTP 400 if the token isn't saved; HTTP 502/504 if GitHub can't
        be reached.

    """
    response = await github.request(
        "PATCH",
        f"/repos/{owner}/{repo}/issues/comments/{comment_id}",
        body.account,
        json={"body": body.body},
    )
    return response.json()


@router.delete("/issues/comments/{comment_id}", status_code=204)
async def delete_comment(
    owner: str, repo: str, comment_id: int, account: TokenKind = "create"
) -> None:
    """Delete a conversation comment.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - comment_id (int): Path. Issue comment ID.
    - account (str, optional): Query. Which saved token acts: `create` (`GITHUB_TOKEN`, default)
        or `merge` (`GITHUB_TOKEN_MERGE`).

    Returns:

    - None: HTTP 204 with no body.

    Raises:

    - HTTPException: HTTP 403 if the account can't delete this comment; otherwise any status
        GitHub returns, with GitHub's message (e.g. HTTP 403 for a missing token permission,
        HTTP 404 if not found); HTTP 400 if the token isn't saved; HTTP 502/504 if GitHub can't
        be reached.

    """
    await github.request(
        "DELETE", f"/repos/{owner}/{repo}/issues/comments/{comment_id}", account
    )


@router.post("/pulls/{number}/reviews")
async def submit_review(
    owner: str, repo: str, number: int, body: SubmitReviewIn
) -> Any:
    """Submit a review with **`GITHUB_TOKEN_MERGE`**, like GitHub's **Review changes**.

    - **APPROVE**: approve merging; the comment is optional.
    - **REQUEST_CHANGES**: block merging until addressed; a comment is **required**.
    - **COMMENT**: general feedback; a comment is **required**.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.
    - body (SubmitReviewIn): JSON body with `event` (`APPROVE`, `REQUEST_CHANGES` or `COMMENT`)
        and the review comment `body`.

    Returns:

    - dict: The submitted GitHub review.

    Raises:

    - HTTPException: HTTP 422 if a required comment is missing or the token's account opened the
        PR; otherwise any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a
        missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved;
        HTTP 502/504 if GitHub can't be reached.

    """
    if body.event != "APPROVE" and not body.body.strip():
        raise HTTPException(
            422, "Write a comment to request changes or leave a review comment."
        )
    response = await github.request(
        "POST",
        f"/repos/{owner}/{repo}/pulls/{number}/reviews",
        "merge",
        json={"event": body.event, "body": body.body},
    )
    return response.json()


DRAFT_MUTATIONS = {
    True: "mutation($id: ID!) { convertPullRequestToDraft(input: {pullRequestId: $id}) { pullRequest { isDraft } } }",
    False: "mutation($id: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $id}) { pullRequest { isDraft } } }",
}


@router.post("/pulls/{number}/draft")
async def set_draft(
    owner: str, repo: str, number: int, body: DraftIn
) -> dict[str, bool]:
    """**Convert to draft** or **mark ready for review**.

    REST can't change this, so it uses GraphQL's `convertPullRequestToDraft` and
    `markPullRequestReadyForReview` mutations.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.
    - body (DraftIn): JSON body with `draft`: `true` converts to draft, `false` marks ready for
        review, and `account`: which saved token acts, `create` (`GITHUB_TOKEN`, default) or
        `merge` (`GITHUB_TOKEN_MERGE`).

    Returns:

    - dict: `{"draft": bool}`, the PR's draft state afterwards.

    Raises:

    - HTTPException: HTTP 403 if the account lacks access; otherwise any status GitHub returns,
        with GitHub's message (e.g. HTTP 403 for a missing token permission, HTTP 404 if not
        found); HTTP 400 if the token isn't saved; HTTP 502/504 if GitHub can't be reached.

    """
    pr = await github.get_json(f"/repos/{owner}/{repo}/pulls/{number}", body.account)
    data = await github.graphql(
        DRAFT_MUTATIONS[body.draft], {"id": pr["node_id"]}, body.account
    )
    result = next(iter(data.values()))
    return {"draft": result["pullRequest"]["isDraft"]}


@router.put("/pulls/{number}/update-branch", status_code=202)
async def update_branch(
    owner: str, repo: str, number: int, body: UpdateBranchIn
) -> Any:
    """Merge the latest base branch into the head branch (GitHub's **Update branch**).

    GitHub does the merge **asynchronously**, so the PR changes a few seconds later. Needs
    **Contents: read & write** on the acting token.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.
    - body (UpdateBranchIn): JSON body with optional `expected_head_sha`, so GitHub refuses if
        the branch moved meanwhile, and `account`: which saved token acts, `create`
        (`GITHUB_TOKEN`, default) or `merge` (`GITHUB_TOKEN_MERGE`).

    Returns:

    - dict: HTTP 202 with GitHub's `message` and `url`.

    Raises:

    - HTTPException: HTTP 422 if the head moved or the branches conflict; otherwise any status
        GitHub returns, with GitHub's message (e.g. HTTP 403 for a missing token permission,
        HTTP 404 if not found); HTTP 400 if the token isn't saved; HTTP 502/504 if GitHub can't
        be reached.

    """
    response = await github.request(
        "PUT",
        f"/repos/{owner}/{repo}/pulls/{number}/update-branch",
        body.account,
        json=body.model_dump(exclude_none=True, exclude={"account"}),
    )
    return response.json()


@router.put("/pulls/{number}/labels")
async def set_labels(owner: str, repo: str, number: int, body: LabelsIn) -> Any:
    """**Replace** the PR's labels with exactly the ones given.

    Send an empty list to remove every label.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.
    - body (LabelsIn): JSON body with `labels`, a list of label names, and `account`: which
        saved token acts, `create` (`GITHUB_TOKEN`, default) or `merge` (`GITHUB_TOKEN_MERGE`).

    Returns:

    - list[dict]: The PR's labels afterwards.

    Raises:

    - HTTPException: Any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a
        missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved;
        HTTP 502/504 if GitHub can't be reached.

    """
    response = await github.request(
        "PUT",
        f"/repos/{owner}/{repo}/issues/{number}/labels",
        body.account,
        json={"labels": body.labels},
    )
    return response.json()


@router.post("/pulls/{number}/assignees")
async def change_assignees(
    owner: str, repo: str, number: int, body: PeopleIn
) -> dict[str, str]:
    """Add and remove **assignees**.

    - **add**: logins to assign.
    - **remove**: logins to unassign.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.
    - body (PeopleIn): JSON body with `add` and `remove` login lists, and `account`: which saved
        token acts, `create` (`GITHUB_TOKEN`, default) or `merge` (`GITHUB_TOKEN_MERGE`).

    Returns:

    - dict: `{"status": "ok"}`.

    Raises:

    - HTTPException: Any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a
        missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved;
        HTTP 502/504 if GitHub can't be reached.

    """
    path = f"/repos/{owner}/{repo}/issues/{number}/assignees"
    if body.add:
        await github.request("POST", path, body.account, json={"assignees": body.add})
    if body.remove:
        await github.request(
            "DELETE", path, body.account, json={"assignees": body.remove}
        )
    return {"status": "ok"}


@router.post("/pulls/{number}/requested-reviewers")
async def change_reviewers(
    owner: str, repo: str, number: int, body: PeopleIn
) -> dict[str, str]:
    """Request reviews from users, or withdraw pending requests.

    - **add**: logins to ask for a review (not the PR's author).
    - **remove**: logins whose pending request is withdrawn.

    People who already reviewed stay listed on the PR either way.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.
    - body (PeopleIn): JSON body with `add` and `remove` login lists, and `account`: which saved
        token acts, `create` (`GITHUB_TOKEN`, default) or `merge` (`GITHUB_TOKEN_MERGE`).

    Returns:

    - dict: `{"status": "ok"}`.

    Raises:

    - HTTPException: HTTP 422 if a login can't review (the author, or not a collaborator);
        otherwise any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a missing
        token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved; HTTP
        502/504 if GitHub can't be reached.

    """
    path = f"/repos/{owner}/{repo}/pulls/{number}/requested_reviewers"
    if body.add:
        await github.request("POST", path, body.account, json={"reviewers": body.add})
    if body.remove:
        await github.request(
            "DELETE", path, body.account, json={"reviewers": body.remove}
        )
    return {"status": "ok"}


async def _closed_pr_in_repo(
    owner: str, repo: str, number: int, kind: TokenKind
) -> dict[str, Any]:
    pr = await github.get_json(f"/repos/{owner}/{repo}/pulls/{number}", kind)
    if pr["state"] != "closed":
        raise HTTPException(
            409,
            "Close or merge the pull request before deleting or restoring its branch.",
        )
    if not _head_in_repo(pr, owner, repo):
        raise HTTPException(
            409, "The head branch is in a fork, so it can't be changed from here."
        )
    return pr


@router.delete("/pulls/{number}/branch", status_code=204)
async def delete_head_branch(
    owner: str, repo: str, number: int, account: TokenKind = "create"
) -> None:
    """Delete the head branch of a **closed or merged** PR.

    Only for branches in **this** repository, not forks. Undo with `POST
    /pulls/{number}/branch`. Needs **Contents: read & write** on the acting token.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.
    - account (str, optional): Query. Which saved token acts: `create` (`GITHUB_TOKEN`, default)
        or `merge` (`GITHUB_TOKEN_MERGE`).

    Returns:

    - None: HTTP 204 with no body.

    Raises:

    - HTTPException: HTTP 409 if the PR is still open or its branch is in a fork; HTTP 422 if
        the branch is already gone; otherwise any status GitHub returns, with GitHub's message
        (e.g. HTTP 403 for a missing token permission, HTTP 404 if not found); HTTP 400 if the
        token isn't saved; HTTP 502/504 if GitHub can't be reached.

    """
    pr = await _closed_pr_in_repo(owner, repo, number, account)
    await github.request(
        "DELETE", f"/repos/{owner}/{repo}/git/refs/heads/{pr['head']['ref']}", account
    )


@router.post("/pulls/{number}/branch", status_code=201)
async def restore_head_branch(
    owner: str, repo: str, number: int, body: AccountIn
) -> Any:
    """Restore a deleted head branch at the PR's last head commit.

    Only for **closed or merged** PRs whose branch was in **this** repository. Needs **Contents:
    read & write** on the acting token.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - number (int): Path. Pull request number.
    - body (AccountIn): JSON body with no other fields, and `account`: which saved token acts,
        `create` (`GITHUB_TOKEN`, default) or `merge` (`GITHUB_TOKEN_MERGE`).

    Returns:

    - dict: HTTP 201 with the created git reference.

    Raises:

    - HTTPException: HTTP 409 if the PR is open or from a fork; HTTP 422 if the branch already
        exists; otherwise any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a
        missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved;
        HTTP 502/504 if GitHub can't be reached.

    """
    pr = await _closed_pr_in_repo(owner, repo, number, body.account)
    response = await github.request(
        "POST",
        f"/repos/{owner}/{repo}/git/refs",
        body.account,
        json={"ref": f"refs/heads/{pr['head']['ref']}", "sha": pr["head"]["sha"]},
    )
    return response.json()
