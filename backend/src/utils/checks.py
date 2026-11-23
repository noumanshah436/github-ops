"""Roll a commit's check runs and commit statuses up into one summary."""

from typing import Any

from src.schemas.pulls import ChecksSummary


def summarize_checks(
    check_runs: list[dict[str, Any]], statuses: list[dict[str, Any]]
) -> ChecksSummary:
    summary = ChecksSummary()
    for run in check_runs:
        summary.total += 1
        if run.get("status") != "completed":
            summary.pending += 1
        elif run.get("conclusion") in ("success", "neutral"):
            summary.success += 1
        elif run.get("conclusion") in ("skipped", "cancelled"):
            summary.skipped += 1
        else:
            summary.failure += 1
    for status in statuses:
        summary.total += 1
        state = status.get("state")
        if state == "success":
            summary.success += 1
        elif state == "pending":
            summary.pending += 1
        else:
            summary.failure += 1
    return summary


def actions_runs_as_check_runs(runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Shape Actions workflow runs like check runs, for tokens that can't read check runs."""
    return [
        {
            "id": run["id"],
            "name": run.get("name") or run.get("display_title") or "workflow",
            "status": run.get("status"),
            "conclusion": run.get("conclusion"),
            "html_url": run.get("html_url"),
            "started_at": run.get("run_started_at"),
            "completed_at": run.get("updated_at")
            if run.get("status") == "completed"
            else None,
            "workflow_run_id": run["id"],
        }
        for run in runs
    ]
