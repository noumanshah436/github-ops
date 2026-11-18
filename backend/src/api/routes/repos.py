"""Repositories GITHUB_TOKEN can see, their branches, and branch comparisons."""

from fastapi import APIRouter

from src.schemas.repos import CompareOut, RepoOut
from src.services.github_client import github

router = APIRouter(prefix="/repos", tags=["repos"])


@router.get("")
async def list_repos() -> list[RepoOut]:
    repos = await github.get_pages(
        "/user/repos", max_pages=3, sort="pushed", affiliation="owner,collaborator,organization_member"
    )
    return [RepoOut.model_validate(r) for r in repos]


@router.get("/{owner}/{repo}/branches")
async def list_branches(owner: str, repo: str) -> list[str]:
    branches = await github.get_pages(f"/repos/{owner}/{repo}/branches", max_pages=5)
    return [b["name"] for b in branches]


@router.get("/{owner}/{repo}/compare")
async def compare(owner: str, repo: str, base: str, head: str) -> CompareOut:
    data = await github.get_json(f"/repos/{owner}/{repo}/compare/{base}...{head}")
    return CompareOut(
        status=data["status"],
        ahead_by=data["ahead_by"],
        behind_by=data["behind_by"],
        commits=data["commits"],
        files=data.get("files", []),
    )
