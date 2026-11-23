"""Save, check and remove GITHUB_TOKEN and GITHUB_TOKEN_MERGE. Responses only show a masked token."""

from fastapi import APIRouter, HTTPException

from src.schemas.tokens import TokenIn, TokenInfo, TokensOut
from src.services.github_client import github
from src.services.token_store import ENV_NAMES, KINDS, TokenKind, mask, token_store

router = APIRouter(prefix="/tokens", tags=["tokens"])


async def _whoami(kind: TokenKind, token: str) -> TokenInfo:
    response = await github.request("GET", "/user", token=token)
    user = response.json()
    return TokenInfo(
        env_name=ENV_NAMES[kind],
        masked=mask(token),
        source=token_store.source(kind),
        login=user["login"],
        avatar_url=user.get("avatar_url"),
        scopes=response.headers.get("x-oauth-scopes"),
    )


@router.get("")
async def list_tokens() -> TokensOut:
    """Show both saved tokens and the GitHub account each belongs to.

    Each token is checked with GitHub's `GET /user`. The token itself is **never** returned,
    only a masked form.

    - **create**: `GITHUB_TOKEN`, creates PRs and reads PRs, checks and Actions.
    - **merge**: `GITHUB_TOKEN_MERGE`, approves and merges.

    Returns:

    - TokensOut: `create` and `merge`, each a `TokenInfo` or `null` when not saved. A token
        GitHub rejects is returned with `error` set instead of a login.

    """
    result: dict[TokenKind, TokenInfo | None] = {}
    for kind in KINDS:
        token = token_store.get(kind)
        if not token:
            result[kind] = None
            continue
        try:
            result[kind] = await _whoami(kind, token)
        except HTTPException as exc:
            result[kind] = TokenInfo(
                env_name=ENV_NAMES[kind],
                masked=mask(token),
                source=token_store.source(kind),
                error=str(exc.detail),
            )
    return TokensOut(**result)


@router.put("/{kind}")
async def save_token(kind: TokenKind, body: TokenIn) -> TokenInfo:
    """Check a token with GitHub, then save it to `backend/.env`.

    The token is **rejected before saving** if GitHub doesn't accept it. It is stored as
    `GITHUB_TOKEN` or `GITHUB_TOKEN_MERGE`, replacing any earlier value.

    Args:

    - kind (str): Path. Which token to save: `create` or `merge`.
    - body (TokenIn): JSON body with `token`. Surrounding whitespace is removed.

    Returns:

    - TokenInfo: Masked token, GitHub login, avatar and scopes, with `source` set to `env_file`.

    Raises:

    - HTTPException: HTTP 401 (or GitHub's status) if GitHub rejects the token; HTTP 422 for an
        empty token.

    """
    token = body.token.strip()
    info = await _whoami(kind, token)  # reject a bad token before saving it
    token_store.put(kind, token)
    return info.model_copy(update={"source": "env_file"})


@router.delete("/{kind}", status_code=204)
async def delete_token(kind: TokenKind) -> None:
    """Remove a saved token from `backend/.env`.

    An exported shell variable with the same name is **not** affected and is used afterwards.

    Args:

    - kind (str): Path. Which token to remove: `create` or `merge`.

    Returns:

    - None: HTTP 204 with no body.

    """
    token_store.delete(kind)
