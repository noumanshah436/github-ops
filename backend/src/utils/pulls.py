"""Shape GraphQL pull request nodes like the REST objects the UI already reads."""

from typing import Any


def pull_summary_from_graphql(node: dict[str, Any]) -> dict[str, Any]:
    author = node.get("author") or {"login": "ghost", "avatarUrl": ""}
    return {
        "number": node["number"],
        "title": node["title"],
        # REST reports merged PRs as "closed" with merged_at set; keep that convention.
        "state": "open" if node["state"] == "OPEN" else "closed",
        "draft": node["isDraft"],
        "merged_at": node.get("mergedAt"),
        "created_at": node["createdAt"],
        "updated_at": node["updatedAt"],
        "html_url": node["url"],
        "user": {"login": author["login"], "avatar_url": author.get("avatarUrl", "")},
        "head": {"ref": node["headRefName"], "sha": node["headRefOid"]},
        "base": {"ref": node["baseRefName"]},
    }
