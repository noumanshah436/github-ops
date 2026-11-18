from typing import Any

from pydantic import BaseModel


class RunDetailOut(BaseModel):
    run: dict[str, Any]
    jobs: list[dict[str, Any]]


class RunPageOut(BaseModel):
    """One page of workflow runs. Ask for ?page=2 and so on, up to last_page."""

    items: list[dict[str, Any]]
    total_count: int
    page: int
    per_page: int
    last_page: int
