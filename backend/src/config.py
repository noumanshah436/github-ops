"""Application settings, overridable with GH_OPS_* environment variables or backend/.env."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="GH_OPS_", env_file=BACKEND_DIR / ".env", extra="ignore")

    app_name: str = "gh-ops"
    # Bind to loopback only: this service holds GitHub tokens and has no login of its own.
    host: str = "127.0.0.1"
    port: int = 8765
    github_api_url: str = "https://api.github.com"
    github_api_version: str = "2022-11-28"
    github_timeout_seconds: float = 30
    # GITHUB_TOKEN and GITHUB_TOKEN_MERGE live here (see services/token_store.py).
    token_env_file: Path = BACKEND_DIR / ".env"
    # Browser origins allowed to call the API: the frontend dev server.
    cors_origins: list[str] = ["http://127.0.0.1:5173", "http://localhost:5173"]


settings = Settings()
