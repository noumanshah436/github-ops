"""Start the gh-ops backend: python run.py [--reload]"""

import os
import sys

import uvicorn

from src.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload="--reload" in sys.argv,
        # NO_COLOR=1 (https://no-color.org) gives plain logs on consoles that can't show colours.
        use_colors=False if os.environ.get("NO_COLOR") else None,
    )
