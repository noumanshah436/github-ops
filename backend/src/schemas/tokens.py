from typing import Literal

from pydantic import BaseModel, Field


class TokenIn(BaseModel):
    token: str = Field(min_length=1)


class TokenInfo(BaseModel):
    env_name: str  # GITHUB_TOKEN or GITHUB_TOKEN_MERGE
    masked: str
    source: Literal["env_file", "environment"] | None = None
    login: str | None = None
    avatar_url: str | None = None
    # Classic tokens report scopes; fine-grained tokens don't send this header.
    scopes: str | None = None
    error: str | None = None


class TokensOut(BaseModel):
    create: TokenInfo | None = None
    merge: TokenInfo | None = None
