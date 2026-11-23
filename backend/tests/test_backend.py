"""Offline tests: GitHub is never called; the client's request method is mocked."""

import asyncio
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from src.main import app
from src.services.github_client import error_message, github
from src.services.token_store import TokenStore, mask, token_store
from src.utils.checks import summarize_checks

CREATE_TOKEN = "github_pat_create_1234567890abcdefghij"
MERGE_TOKEN = "github_pat_merge_1234567890abcdefghijk"


@pytest.fixture
def env_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / ".env"
    monkeypatch.setattr(token_store, "env_file", path)
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    monkeypatch.delenv("GITHUB_TOKEN_MERGE", raising=False)
    return path


@pytest.fixture
def calls(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Record GitHub calls and answer with canned JSON."""
    recorded: list[dict[str, Any]] = []

    async def fake_request(
        method: str, path: str, kind: str = "create", **kwargs: Any
    ) -> httpx.Response:
        recorded.append({"method": method, "path": path, "kind": kind, **kwargs})
        if path == "/user":
            return httpx.Response(
                200, json={"login": "octo"}, headers={"x-oauth-scopes": "repo"}
            )
        return httpx.Response(200, json={"merged": True})

    monkeypatch.setattr(github, "request", fake_request)
    return recorded


def test_tokens_saved_under_doc_names_in_env_file(env_file: Path) -> None:
    env_file.write_text("GH_OPS_PORT=9000\n", encoding="utf-8")
    store = TokenStore(env_file)
    store.put("create", f"  {CREATE_TOKEN}  ")
    store.put("merge", MERGE_TOKEN)
    assert env_file.read_text(encoding="utf-8").splitlines() == [
        "GH_OPS_PORT=9000",
        f"GITHUB_TOKEN={CREATE_TOKEN}",
        f"GITHUB_TOKEN_MERGE={MERGE_TOKEN}",
    ]
    store.delete("create")
    assert store.get("create") is None
    assert store.get("merge") == MERGE_TOKEN


def test_exported_shell_variable_is_used_when_env_file_has_none(
    env_file: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env_file.write_text("export GITHUB_TOKEN_MERGE='quoted_value'\n", encoding="utf-8")
    monkeypatch.setenv("GITHUB_TOKEN", CREATE_TOKEN)
    store = TokenStore(env_file)
    assert (store.get("create"), store.source("create")) == (
        CREATE_TOKEN,
        "environment",
    )
    assert (store.get("merge"), store.source("merge")) == ("quoted_value", "env_file")


def test_mask_never_shows_whole_token() -> None:
    assert mask(CREATE_TOKEN) == "github_p…ghij"
    assert mask("short") == "…"


def test_checks_summary_counts_runs_and_statuses() -> None:
    runs = [
        {"status": "completed", "conclusion": "success"},
        {"status": "completed", "conclusion": "failure"},
        {"status": "in_progress", "conclusion": None},
        {"status": "completed", "conclusion": "skipped"},
    ]
    statuses = [{"state": "success"}, {"state": "error"}]
    summary = summarize_checks(runs, statuses)
    assert summary.model_dump() == {
        "total": 6,
        "success": 2,
        "failure": 2,
        "pending": 1,
        "skipped": 1,
    }


def test_saving_token_returns_masked_identity_only(
    env_file: Path, calls: list[dict[str, Any]]
) -> None:
    response = TestClient(app).put("/api/tokens/merge", json={"token": MERGE_TOKEN})
    assert response.status_code == 200
    assert MERGE_TOKEN not in response.text
    body = response.json()
    assert (body["env_name"], body["login"], body["source"]) == (
        "GITHUB_TOKEN_MERGE",
        "octo",
        "env_file",
    )
    assert f"GITHUB_TOKEN_MERGE={MERGE_TOKEN}" in env_file.read_text(encoding="utf-8")


def test_create_pr_uses_create_token(calls: list[dict[str, Any]]) -> None:
    body = {"title": "t", "head": "feature", "base": "staging"}
    assert (
        TestClient(app).post("/api/repos/acme/app/pulls", json=body).status_code == 201
    )
    assert (calls[-1]["path"], calls[-1]["kind"]) == ("/repos/acme/app/pulls", "create")


def test_approve_and_merge_use_merge_token(calls: list[dict[str, Any]]) -> None:
    client = TestClient(app)
    assert (
        client.post("/api/repos/acme/app/pulls/7/approve", json={}).status_code == 200
    )
    assert calls[-1]["kind"] == "merge"
    assert calls[-1]["json"] == {"event": "APPROVE", "body": "LGTM"}
    response = client.put(
        "/api/repos/acme/app/pulls/7/merge", json={"sha": "abc1234def"}
    )
    assert response.status_code == 200
    assert (calls[-1]["method"], calls[-1]["kind"]) == ("PUT", "merge")
    assert calls[-1]["json"] == {"sha": "abc1234def", "merge_method": "merge"}


def test_missing_token_is_a_clear_400(env_file: Path) -> None:
    response = TestClient(app).get("/api/repos")
    assert response.status_code == 400
    assert "GITHUB_TOKEN (create PR)" in response.json()["detail"]


def test_pr_detail_falls_back_to_actions_when_token_cant_read_checks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Fine-grained token without Checks/Commit statuses permission: PR still loads."""
    from fastapi import HTTPException

    async def fake_get_json(path: str, kind: str = "create", **params: Any) -> Any:
        if path.endswith("/pulls/5"):
            return {
                "head": {"sha": "abc123", "label": "acme:feat"},
                "base": {"ref": "main"},
                "state": "open",
            }
        if path.endswith("/compare/main...acme:feat"):
            return {"behind_by": 3}
        if path.endswith("/reviews"):
            return []
        if path.endswith(("/check-runs", "/status")):
            raise HTTPException(
                403, "GitHub: Resource not accessible by personal access token"
            )
        if path.endswith("/actions/runs"):
            assert params["head_sha"] == "abc123"
            run = {
                "id": 9,
                "name": "CI",
                "status": "completed",
                "conclusion": "failure",
                "html_url": "u",
            }
            return {"workflow_runs": [run]}
        raise AssertionError(path)

    monkeypatch.setattr(github, "get_json", fake_get_json)
    response = TestClient(app).get("/api/repos/acme/app/pulls/5")
    assert response.status_code == 200
    body = response.json()
    assert body["check_runs"][0]["workflow_run_id"] == 9
    assert body["behind_by"] == 3
    assert body["checks_summary"]["failure"] == 1
    assert any("Checks: read" in n for n in body["checks_notes"])
    assert any("Commit statuses: read" in n for n in body["checks_notes"])


def test_pull_list_uses_graphql_page(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    async def fake_graphql(
        query: str, variables: dict[str, Any], kind: str = "create"
    ) -> Any:
        seen.update(variables)
        node = {
            "number": 3,
            "title": "Fix",
            "state": "MERGED",
            "isDraft": False,
            "mergedAt": "2026-11-18T10:00:00Z",
            "createdAt": "2026-11-17T10:00:00Z",
            "updatedAt": "2026-11-18T10:00:00Z",
            "url": "u",
            "headRefName": "fix/x",
            "headRefOid": "abc",
            "baseRefName": "staging",
            "author": None,
        }
        page = {
            "totalCount": 40,
            "pageInfo": {"hasNextPage": True, "endCursor": "CUR"},
            "nodes": [node],
        }
        return {"repository": {"pullRequests": page}}

    monkeypatch.setattr(github, "graphql", fake_graphql)
    response = TestClient(app).get(
        "/api/repos/acme/app/pulls", params={"state": "closed", "after": "PREV"}
    )
    assert response.status_code == 200
    body = response.json()
    assert (
        seen["states"] == ["CLOSED", "MERGED"]
        and seen["after"] == "PREV"
        and seen["first"] == 25
    )
    assert (body["total_count"], body["has_next_page"], body["end_cursor"]) == (
        40,
        True,
        "CUR",
    )
    item = body["items"][0]
    assert (item["state"], item["merged_at"], item["user"]["login"]) == (
        "closed",
        "2026-11-18T10:00:00Z",
        "ghost",
    )
    assert (item["head"]["ref"], item["base"]["ref"]) == ("fix/x", "staging")


def test_cors_allows_only_the_frontend_origin() -> None:
    client = TestClient(app)
    preflight = {"Access-Control-Request-Method": "PUT"}
    ok = client.options(
        "/api/tokens/create", headers={"Origin": "http://127.0.0.1:5173", **preflight}
    )
    assert ok.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173"
    other = client.options(
        "/api/tokens/create", headers={"Origin": "https://evil.example", **preflight}
    )
    assert "access-control-allow-origin" not in other.headers
    simple = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in simple.headers


def test_root_redirects_to_swagger() -> None:
    response = TestClient(app).get("/", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/docs"


def test_runs_list_is_paged(env_file: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[dict[str, Any]] = []

    async def fake_get_json(path: str, kind: str = "create", **params: Any) -> Any:
        seen.append(params)
        return {"total_count": 2500, "workflow_runs": [{"id": 1}]}

    monkeypatch.setattr(github, "get_json", fake_get_json)
    client = TestClient(app)

    body = client.get("/api/repos/o/r/actions/runs?page=3&per_page=30").json()
    assert seen[-1]["page"] == 3 and seen[-1]["per_page"] == 30
    assert body == {
        "items": [{"id": 1}],
        "total_count": 2500,
        "page": 3,
        "per_page": 30,
        "last_page": 84,
    }

    # With a filter GitHub stops at 1,000 runs, so the last page is 34, not 84.
    body = client.get("/api/repos/o/r/actions/runs?branch=main&per_page=30").json()
    assert body["last_page"] == 34

    assert client.get("/api/repos/o/r/actions/runs?page=0").status_code == 422


def test_env_file_values_lose_only_matching_quotes(env_file: Path) -> None:
    env_file.write_text(
        'GITHUB_TOKEN="abc"\nGITHUB_TOKEN_MERGE=abc\'\n', encoding="utf-8"
    )
    store = TokenStore(env_file)
    assert store.get("create") == "abc"
    assert store.get("merge") == "abc'"


def test_github_error_messages_are_truncated() -> None:
    huge = "x" * 5000
    assert len(error_message(httpx.Response(422, json={"message": huge}))) == 500
    assert len(error_message(httpx.Response(500, text=huge))) == 500
    assert (
        error_message(httpx.Response(422, json=["not", "a", "dict"]))
        == '["not","a","dict"]'
    )


@pytest.mark.parametrize(
    ("error_type", "status"), [("FORBIDDEN", 403), ("NOT_FOUND", 502)]
)
def test_graphql_errors_in_a_200_body_raise(
    monkeypatch: pytest.MonkeyPatch, error_type: str, status: int
) -> None:
    async def fake_request(
        method: str, path: str, kind: str = "create", **kwargs: Any
    ) -> httpx.Response:
        return httpx.Response(
            200,
            json={"data": None, "errors": [{"type": error_type, "message": "nope"}]},
        )

    monkeypatch.setattr(github, "request", fake_request)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(github.graphql("query { viewer { login } }", {}))
    assert (exc.value.status_code, exc.value.detail) == (status, "GitHub: nope")


def test_close_reopen_and_edit_pr_use_chosen_account(
    calls: list[dict[str, Any]],
) -> None:
    client = TestClient(app)
    assert (
        client.patch(
            "/api/repos/acme/app/pulls/7", json={"state": "closed"}
        ).status_code
        == 200
    )
    assert (calls[-1]["method"], calls[-1]["path"], calls[-1]["kind"]) == (
        "PATCH",
        "/repos/acme/app/pulls/7",
        "create",
    )
    assert calls[-1]["json"] == {"state": "closed"}
    body = {"state": "open", "title": "New title", "account": "merge"}
    assert client.patch("/api/repos/acme/app/pulls/7", json=body).status_code == 200
    assert calls[-1]["kind"] == "merge"
    assert calls[-1]["json"] == {"state": "open", "title": "New title"}
    assert client.patch("/api/repos/acme/app/pulls/7", json={}).status_code == 422


def test_comment_goes_to_the_pr_issue(calls: list[dict[str, Any]]) -> None:
    response = TestClient(app).post(
        "/api/repos/acme/app/pulls/7/comments", json={"body": "hi", "account": "merge"}
    )
    assert response.status_code == 201
    assert (calls[-1]["path"], calls[-1]["kind"], calls[-1]["json"]) == (
        "/repos/acme/app/issues/7/comments",
        "merge",
        {"body": "hi"},
    )


def test_request_changes_needs_a_comment_and_uses_merge_token(
    calls: list[dict[str, Any]],
) -> None:
    client = TestClient(app)
    assert (
        client.post(
            "/api/repos/acme/app/pulls/7/reviews", json={"event": "REQUEST_CHANGES"}
        ).status_code
        == 422
    )
    body = {"event": "REQUEST_CHANGES", "body": "Please fix"}
    assert (
        client.post("/api/repos/acme/app/pulls/7/reviews", json=body).status_code == 200
    )
    assert (calls[-1]["kind"], calls[-1]["json"]) == ("merge", body)


def test_reviewers_are_added_and_removed(calls: list[dict[str, Any]]) -> None:
    body = {"add": ["ann"], "remove": ["bob"]}
    assert (
        TestClient(app)
        .post("/api/repos/acme/app/pulls/7/requested-reviewers", json=body)
        .status_code
        == 200
    )
    assert [(c["method"], c["json"]) for c in calls] == [
        ("POST", {"reviewers": ["ann"]}),
        ("DELETE", {"reviewers": ["bob"]}),
    ]


def test_head_branch_delete_only_for_closed_pr_in_same_repo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pr: dict[str, Any] = {
        "state": "open",
        "head": {"ref": "feat/x", "sha": "abc", "repo": {"full_name": "acme/app"}},
    }
    deleted: list[str] = []

    async def fake_get_json(path: str, kind: str = "create", **params: Any) -> Any:
        return pr

    async def fake_request(
        method: str, path: str, kind: str = "create", **kwargs: Any
    ) -> httpx.Response:
        deleted.append(f"{method} {path}")
        return httpx.Response(204)

    monkeypatch.setattr(github, "get_json", fake_get_json)
    monkeypatch.setattr(github, "request", fake_request)
    client = TestClient(app)
    assert client.delete("/api/repos/acme/app/pulls/7/branch").status_code == 409
    pr["state"] = "closed"
    pr["head"]["repo"] = {"full_name": "someone/fork"}
    assert client.delete("/api/repos/acme/app/pulls/7/branch").status_code == 409
    pr["head"]["repo"] = {"full_name": "Acme/App"}
    assert (
        client.delete("/api/repos/acme/app/pulls/7/branch?account=merge").status_code
        == 204
    )
    assert deleted == ["DELETE /repos/acme/app/git/refs/heads/feat/x"]
