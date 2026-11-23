"""Async GitHub REST client that authenticates with a stored token."""

import logging
from typing import Any

import httpx
from fastapi import HTTPException

from src.config import settings
from src.services.token_store import LABELS, TokenKind, token_store

logger = logging.getLogger(__name__)
MAX_ERROR_CHARS = 500


class GitHubClient:
    def __init__(self) -> None:
        self._http = httpx.AsyncClient(
            base_url=settings.github_api_url,
            headers={
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": settings.github_api_version,
            },
            timeout=settings.github_timeout_seconds,
            # Job logs redirect to a signed blob URL; httpx drops Authorization on cross-host redirects.
            follow_redirects=True,
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    @staticmethod
    def _token(kind: TokenKind) -> str:
        token = token_store.get(kind)
        if not token:
            raise HTTPException(
                400, f"No {LABELS[kind]} token saved. Add it under Tokens."
            )
        return token

    async def request(
        self,
        method: str,
        path: str,
        kind: TokenKind = "create",
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
        token: str | None = None,
    ) -> httpx.Response:
        """Call GitHub. On failure raise an HTTPException with GitHub's status and message."""
        headers = {"Authorization": f"Bearer {token or self._token(kind)}"}
        clean = {k: v for k, v in (params or {}).items() if v not in (None, "")}
        try:
            response = await self._http.request(
                method, path, params=clean, json=json, headers=headers
            )
        except httpx.TimeoutException as exc:
            raise HTTPException(
                504, f"GitHub didn't answer in time ({type(exc).__name__})"
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                502, f"Could not reach GitHub: {type(exc).__name__}: {exc}"
            ) from exc
        if response.status_code >= 400:
            raise HTTPException(
                response.status_code, f"GitHub: {error_message(response)}"
            )
        return response

    async def get_json(
        self, path: str, kind: TokenKind = "create", **params: Any
    ) -> Any:
        response = await self.request("GET", path, kind, params=params)
        return response.json() if response.content else None

    async def graphql(
        self, query: str, variables: dict[str, Any], kind: TokenKind = "create"
    ) -> Any:
        """Run a GraphQL query. GitHub reports query errors with HTTP 200, so check the body too."""
        response = await self.request(
            "POST", "/graphql", kind, json={"query": query, "variables": variables}
        )
        body = response.json()
        if body.get("errors"):
            message = "; ".join(str(e.get("message", e)) for e in body["errors"])
            status = (
                403
                if any(e.get("type") == "FORBIDDEN" for e in body["errors"])
                else 502
            )
            raise HTTPException(status, f"GitHub: {message}")
        return body["data"]

    async def get_pages(
        self, path: str, max_pages: int = 10, **params: Any
    ) -> list[Any]:
        """Collect a paginated list endpoint, 100 items per page, stopping after max_pages."""
        items: list[Any] = []
        for page in range(1, max_pages + 1):
            batch = await self.get_json(path, per_page=100, page=page, **params)
            items += batch
            if len(batch) < 100:
                return items
        logger.warning(
            "%s: stopped after %d pages (%d items); there may be more",
            path,
            max_pages,
            len(items),
        )
        return items


def error_message(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text[:MAX_ERROR_CHARS]
    if not isinstance(body, dict):
        return response.text[:MAX_ERROR_CHARS]
    message = str(body.get("message", response.text))
    errors = body.get("errors")
    if errors:
        details = [
            e.get("message", str(e)) if isinstance(e, dict) else str(e) for e in errors
        ]
        message += " — " + "; ".join(details)
    return message[:MAX_ERROR_CHARS]


github = GitHubClient()
