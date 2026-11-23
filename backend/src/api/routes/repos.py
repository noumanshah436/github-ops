"""Repositories GITHUB_TOKEN can see, their branches, and branch comparisons."""

from fastapi import APIRouter

from src.schemas.repos import CompareOut, RepoOut
from src.services.github_client import github

router = APIRouter(prefix="/repos", tags=["repos"])


@router.get("")
async def list_repos() -> list[RepoOut]:
    """List repositories `GITHUB_TOKEN` can see, most recently pushed first.

    Includes repositories the account **owns**, **collaborates on**, or reaches through an
    **organization**. Reads at most 300 repositories.

    Returns:

    - list[RepoOut]: Full name, visibility, default branch and last push time of each
        repository.

    Raises:

    - HTTPException: Any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a
        missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved;
        HTTP 502/504 if GitHub can't be reached.

    """
    repos = await github.get_pages(
        "/user/repos",
        max_pages=3,
        sort="pushed",
        affiliation="owner,collaborator,organization_member",
    )
    return [RepoOut.model_validate(r) for r in repos]


@router.get("/{owner}/{repo}/branches")
async def list_branches(owner: str, repo: str) -> list[str]:
    """List the repository's branch names. Reads at most **500** branches.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.

    Returns:

    - list[str]: Branch names.

    Raises:

    - HTTPException: Any status GitHub returns, with GitHub's message (e.g. HTTP 403 for a
        missing token permission, HTTP 404 if not found); HTTP 400 if the token isn't saved;
        HTTP 502/504 if GitHub can't be reached.

    """
    branches = await github.get_pages(f"/repos/{owner}/{repo}/branches", max_pages=5)
    return [b["name"] for b in branches]


@router.get("/{owner}/{repo}/compare")
async def compare(owner: str, repo: str, base: str, head: str) -> CompareOut:
    """Compare two branches, as on GitHub's **Compare** page.

    Used before creating a PR to show how far `head` is **ahead of** and **behind** `base`, and
    which commits and files differ.

    Args:

    - owner (str): Path. Repository owner (user or organization login).
    - repo (str): Path. Repository name.
    - base (str): Query. Branch the changes would merge into.
    - head (str): Query. Branch with the changes.

    Returns:

    - CompareOut: `status`, `ahead_by`, `behind_by`, `commits` and `files`.

    Raises:

    - HTTPException: HTTP 404 if either branch doesn't exist; otherwise any status GitHub
        returns, with GitHub's message (e.g. HTTP 403 for a missing token permission, HTTP 404
        if not found); HTTP 400 if the token isn't saved; HTTP 502/504 if GitHub can't be
        reached.

    """
    data = await github.get_json(f"/repos/{owner}/{repo}/compare/{base}...{head}")
    return CompareOut(
        status=data["status"],
        ahead_by=data["ahead_by"],
        behind_by=data["behind_by"],
        commits=data["commits"],
        files=data.get("files", []),
    )
