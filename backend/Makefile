.PHONY: help install test lint lint-all format run clean

# Default target
help:
	@echo "Available commands:"
	@echo "  install   - Install dependencies (uv sync)"
	@echo "  test      - Run tests"
	@echo "  lint      - ruff format check, ruff lint and pyright on new/modified files"
	@echo "  lint-all  - The same checks on every file"
	@echo "  format    - ruff --fix + ruff format on new/modified files, then check"
	@echo "  run       - Run the backend on 127.0.0.1:8765"
	@echo "  clean     - Remove caches"

install:
	uv sync

test:
	uv run pytest

# Only files that differ from origin/main are checked.
lint:
	SKIP_TESTS=1 bash scripts/local_ci.sh

lint-all:
	SKIP_TESTS=1 bash scripts/local_ci.sh --all

format:
	SKIP_TESTS=1 bash scripts/local_ci.sh --fix

run:
	uv run python run.py

clean:
	find . -type d -name "__pycache__" -not -path "./.venv/*" -exec rm -rf {} +
	rm -rf .pytest_cache .ruff_cache
