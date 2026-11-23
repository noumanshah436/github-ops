"""GitHub Actions: workflows, runs, jobs, logs, re-run failed jobs and cancel."""

import asyncio
from typing import Annotated, Any

from fastapi import APIRouter, Query
from fastapi.responses import PlainTextResponse

from src.schemas.actions import RunDetailOut, RunPageOut
from src.services.github_client import github

router = APIRouter(prefix="/repos/{owner}/{repo}/actions", tags=["actions"])

MAX_FILTERED_RESULTS = 1000


@router.get("/workflows")
async def list_workflows(owner: str, repo: str) -> Any:
    """List the repository's GitHub Actions workflows.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.

    Returns:

    - list[dict]: GitHub workflow objects with `id`, `name`, `path` and `state`.

    Raises:

    - HTTPException: Any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a
        missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved;
        HTTP 502/504 if GitHub can't be reached.

    """
    data = await github.get_json(
        f"/repos/{owner}/{repo}/actions/workflows", per_page=100
    )
    return data["workflows"]


@router.get("/runs")
async def list_runs(
    owner: str,
    repo: str,
    branch: str | None = None,
    status: str | None = None,
    workflow: str | None = None,
    head_sha: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 30,
) -> RunPageOut:
    """List Actions runs, newest first, one page at a time.

    All filters are optional and can be combined. GitHub returns at most **1,000** runs when
    filtering by branch, status or commit, so `last_page` is capped to what can actually be
    reached.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - branch (str, optional): Query. Only runs for this branch.
    - status (str, optional): Query. Only runs with this status or conclusion, e.g.
        `in_progress`, `completed`, `failure`.
    - workflow (str, optional): Query. Only runs of this workflow file, e.g. `deploy.yml`.
    - head_sha (str, optional): Query. Only runs for this commit.
    - page (int, optional): Query. 1-based page number. Defaults to 1.
    - per_page (int, optional): Query. Runs per page, 1 to 100. Defaults to 30.

    Returns:

    - RunPageOut: `items` (the runs), `total_count`, `page`, `per_page` and `last_page`.

    Raises:

    - HTTPException: HTTP 404 if the workflow file doesn't exist; HTTP 422 for an invalid page
        or page size; otherwise any status GitHub returns, with GitHub's message (e.g. HTTP 403
        for a missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't
        saved; HTTP 502/504 if GitHub can't be reached.

    """
    base = f"/repos/{owner}/{repo}/actions"
    path = f"{base}/workflows/{workflow}/runs" if workflow else f"{base}/runs"
    data = await github.get_json(
        path,
        branch=branch,
        status=status,
        head_sha=head_sha,
        page=page,
        per_page=per_page,
    )
    total = data["total_count"]
    # GitHub returns at most 1,000 runs when filtering by branch, status or commit.
    reachable = (
        min(total, MAX_FILTERED_RESULTS) if (branch or status or head_sha) else total
    )
    return RunPageOut(
        items=data["workflow_runs"],
        total_count=total,
        page=page,
        per_page=per_page,
        last_page=max(1, -(-reachable // per_page)),
    )


@router.get("/runs/{run_id}")
async def get_run(owner: str, repo: str, run_id: int) -> RunDetailOut:
    """Get one Actions run with its **jobs and steps**.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - run_id (int): Path. Workflow run ID.

    Returns:

    - RunDetailOut: `run` and `jobs`, each job with its `steps`.

    Raises:

    - HTTPException: Any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a
        missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved;
        HTTP 502/504 if GitHub can't be reached.

    """
    base = f"/repos/{owner}/{repo}/actions/runs/{run_id}"
    run, jobs = await asyncio.gather(
        github.get_json(base), github.get_json(f"{base}/jobs", per_page=100)
    )
    return RunDetailOut(run=run, jobs=jobs["jobs"])


@router.get("/jobs/{job_id}/logs", response_class=PlainTextResponse)
async def job_logs(owner: str, repo: str, job_id: int) -> str:
    """Get a job's full log as **plain text**.

    GitHub redirects to a signed download URL; the redirect is followed for you.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - job_id (int): Path. Job ID.

    Returns:

    - str: The log text (`text/plain`).

    Raises:

    - HTTPException: HTTP 404 if the job or its log doesn't exist (logs expire); otherwise any
        status GitHub returns, with GitHub's message (e.g. HTTP 403 for a missing token
        permission, HTTP 404 if not found); HTTP 400 if the token isn't saved; HTTP 502/504 if
        GitHub can't be reached.

    """
    response = await github.request(
        "GET", f"/repos/{owner}/{repo}/actions/jobs/{job_id}/logs"
    )
    return response.text


@router.post("/runs/{run_id}/rerun-failed", status_code=201)
async def rerun_failed(owner: str, repo: str, run_id: int) -> dict[str, bool]:
    """Re-run **only the failed jobs** of a run.

    Needs **Actions: read & write** on `GITHUB_TOKEN`.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - run_id (int): Path. Workflow run ID.

    Returns:

    - dict: HTTP 201 with `{"ok": true}`.

    Raises:

    - HTTPException: HTTP 403 if the run can't be re-run (still running, or missing permission);
        otherwise any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a missing
        token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved; HTTP
        502/504 if GitHub can't be reached.

    """
    await github.request(
        "POST", f"/repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs"
    )
    return {"ok": True}


@router.post("/runs/{run_id}/cancel", status_code=202)
async def cancel_run(owner: str, repo: str, run_id: int) -> dict[str, bool]:
    """Cancel a queued or running workflow run.

    Needs **Actions: read & write** on `GITHUB_TOKEN`.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - run_id (int): Path. Workflow run ID.

    Returns:

    - dict: HTTP 202 with `{"ok": true}`. GitHub cancels the run shortly afterwards.

    Raises:

    - HTTPException: HTTP 409 if the run already finished; otherwise any status GitHub returns,
        with GitHub's message (e.g. HTTP 403 for a missing token permission, HTTP 404 if not
        found); HTTP 400 if the token isn't saved; HTTP 502/504 if GitHub can't be reached.

    """
    await github.request("POST", f"/repos/{owner}/{repo}/actions/runs/{run_id}/cancel")
    return {"ok": True}
