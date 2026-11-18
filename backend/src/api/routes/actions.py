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
    data = await github.get_json(f"/repos/{owner}/{repo}/actions/workflows", per_page=100)
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
    base = f"/repos/{owner}/{repo}/actions"
    path = f"{base}/workflows/{workflow}/runs" if workflow else f"{base}/runs"
    data = await github.get_json(
        path, branch=branch, status=status, head_sha=head_sha, page=page, per_page=per_page
    )
    total = data["total_count"]
    # GitHub returns at most 1,000 runs when filtering by branch, status or commit.
    reachable = min(total, MAX_FILTERED_RESULTS) if (branch or status or head_sha) else total
    return RunPageOut(
        items=data["workflow_runs"],
        total_count=total,
        page=page,
        per_page=per_page,
        last_page=max(1, -(-reachable // per_page)),
    )


@router.get("/runs/{run_id}")
async def get_run(owner: str, repo: str, run_id: int) -> RunDetailOut:
    base = f"/repos/{owner}/{repo}/actions/runs/{run_id}"
    run, jobs = await asyncio.gather(github.get_json(base), github.get_json(f"{base}/jobs", per_page=100))
    return RunDetailOut(run=run, jobs=jobs["jobs"])


@router.get("/jobs/{job_id}/logs", response_class=PlainTextResponse)
async def job_logs(owner: str, repo: str, job_id: int) -> str:
    response = await github.request("GET", f"/repos/{owner}/{repo}/actions/jobs/{job_id}/logs")
    return response.text


@router.post("/runs/{run_id}/rerun-failed", status_code=201)
async def rerun_failed(owner: str, repo: str, run_id: int) -> dict[str, bool]:
    await github.request("POST", f"/repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs")
    return {"ok": True}


@router.post("/runs/{run_id}/cancel", status_code=202)
async def cancel_run(owner: str, repo: str, run_id: int) -> dict[str, bool]:
    await github.request("POST", f"/repos/{owner}/{repo}/actions/runs/{run_id}/cancel")
    return {"ok": True}
