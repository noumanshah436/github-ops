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
    token = body.token.strip()
    info = await _whoami(kind, token)  # reject a bad token before saving it
    token_store.put(kind, token)
    return info.model_copy(update={"source": "env_file"})


@router.delete("/{kind}", status_code=204)
async def delete_token(kind: TokenKind) -> None:
    token_store.delete(kind)
