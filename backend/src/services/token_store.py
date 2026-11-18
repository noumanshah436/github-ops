"""The two GitHub tokens, named as in GitHub_PR_Operations_fashion_studio.md.

- GITHUB_TOKEN ("create"): create PRs, read PRs, checks and Actions, re-run or cancel runs.
- GITHUB_TOKEN_MERGE ("merge"): approve and merge. Usually a second account,
  since GitHub won't let you approve your own PR.

Tokens saved from the UI go into backend/.env; an exported shell variable with the same
name is used when .env has none. Neither is ever sent to the browser.
"""

import os
from pathlib import Path
from typing import Literal

from src.config import settings

TokenKind = Literal["create", "merge"]
KINDS: tuple[TokenKind, ...] = ("create", "merge")
ENV_NAMES: dict[TokenKind, str] = {"create": "GITHUB_TOKEN", "merge": "GITHUB_TOKEN_MERGE"}
LABELS: dict[TokenKind, str] = {
    "create": "GITHUB_TOKEN (create PR)",
    "merge": "GITHUB_TOKEN_MERGE (approve/merge)",
}


class TokenStore:
    def __init__(self, env_file: Path) -> None:
        self.env_file = env_file

    def _lines(self) -> list[str]:
        try:
            return self.env_file.read_text(encoding="utf-8").splitlines()
        except FileNotFoundError:
            return []

    def _from_file(self, name: str) -> str | None:
        for line in self._lines():
            key, sep, value = line.removeprefix("export ").partition("=")
            if sep and key.strip() == name:
                return value.strip().strip("'\"") or None
        return None

    def _write(self, name: str, value: str | None) -> None:
        """Set or remove one NAME=value line, keeping every other line of .env."""
        lines = [
            line for line in self._lines() if line.removeprefix("export ").partition("=")[0].strip() != name
        ]
        if value is not None:
            lines.append(f"{name}={value}")
        self.env_file.parent.mkdir(parents=True, exist_ok=True)
        self.env_file.write_text("\n".join(lines) + "\n" if lines else "", encoding="utf-8")

    def source(self, kind: TokenKind) -> Literal["env_file", "environment"] | None:
        name = ENV_NAMES[kind]
        if self._from_file(name):
            return "env_file"
        return "environment" if os.environ.get(name) else None

    def get(self, kind: TokenKind) -> str | None:
        name = ENV_NAMES[kind]
        return self._from_file(name) or os.environ.get(name) or None

    def put(self, kind: TokenKind, token: str) -> None:
        self._write(ENV_NAMES[kind], token.strip())

    def delete(self, kind: TokenKind) -> None:
        self._write(ENV_NAMES[kind], None)


def mask(token: str) -> str:
    """Show enough of a token to recognise it, never the whole secret."""
    return f"{token[:8]}…{token[-4:]}" if len(token) > 16 else "…"


token_store = TokenStore(settings.token_env_file)
