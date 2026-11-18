"""gh-ops backend: GitHub PR and Actions API on 127.0.0.1:8765 (Swagger at /docs)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from src.api.routes.actions import router as actions_router
from src.api.routes.pulls import router as pulls_router
from src.api.routes.repos import router as repos_router
from src.api.routes.tokens import router as tokens_router
from src.config import settings
from src.services.github_client import github


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    await github.aclose()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

# The frontend runs on its own port, so the browser needs permission to call this API.
# Only the listed origins are allowed: other websites can't use your tokens through it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)

for router in (tokens_router, repos_router, pulls_router, actions_router):
    app.include_router(router, prefix="/api")


@app.get("/", include_in_schema=False)
async def root() -> RedirectResponse:
    return RedirectResponse("/docs")


@app.get("/api/health", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok"}
