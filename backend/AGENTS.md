# Agent instructions

## Lint, format and type checks

Ruff handles formatting, import order and linting (`pyproject.toml`);
Pyright checks types (`pyrightconfig.json`).
`scripts/local_ci.sh` finds the Python files under `src/`, `tests/` and `run.py`
that differ from `origin/main` and checks only those. A file you change must
pass in full.

From `backend/` in a Bash shell (Git Bash on Windows):

```bash
bash scripts/local_ci.sh         # check the changed files, then run the tests
bash scripts/local_ci.sh --fix   # ruff --fix + ruff format the changed files, then all checks and tests
bash scripts/local_ci.sh --all   # check every file
```

With `make`: `make lint`, `make format`, `make lint-all`, `make test`.

Then fix by hand whatever it still reports (lint errors Ruff can't auto-fix,
Pyright errors, failing tests) and rerun until it ends with
`==> All checks passed`. Don't call the task done before that.

Rules:

- Don't reformat files you didn't otherwise change (`--fix` only touches changed files).
- Don't silence a finding with `# noqa`, `# type: ignore` or
  `# pyright: ignore`, and don't relax the config in `pyproject.toml` or
  `pyrightconfig.json`. Fix the code instead.
- Don't edit `scripts/local_ci.sh` to make a check pass.
- Route handlers get Google-style docstrings with markdown (bold, code, lists),
  with `Args:`, `Returns:` and `Raises:` sections written as `- name (type): text`
  bullets. FastAPI shows them in Swagger.

## Make sure the checks actually ran

A real run shows Ruff output ("N files already formatted"), Pyright's
"0 errors" summary and the pytest results. If pytest fails with
`PermissionError` on its temp folder, pass `--basetemp` (see `README.md`).

If `origin/main` is missing or stale, run `git fetch origin main` first.
