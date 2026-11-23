#!/usr/bin/env bash
# Local CI for the gh-ops backend: ruff format check, ruff lint (incl. import
# order) and pyright on NEW or MODIFIED Python files only, then the tests.
#
# Untouched existing files are not checked. A file you change must pass in full.
#
# Usage (from backend/, in a Bash shell — Git Bash on Windows):
#   bash scripts/local_ci.sh            # check
#   bash scripts/local_ci.sh --fix      # ruff --fix + format the changed files, then check
#   bash scripts/local_ci.sh --all      # check every file, not only changed ones
#   BASE_REF=origin/staging bash scripts/local_ci.sh   # compare against another branch
#   SKIP_TESTS=1 bash scripts/local_ci.sh              # lint/type checks only
#   UV=/path/to/uv.exe bash scripts/local_ci.sh        # if the `uv` on PATH is a broken shim
#   PYTEST_ARGS="--basetemp ./.pytest_tmp" bash scripts/local_ci.sh  # extra pytest options
#
# Run `git fetch origin main` first so the base is current; the script never
# fetches (local checks need no network). Requires Bash 3.2+.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE_REF="${BASE_REF:-origin/main}"
UV="${UV:-uv}"
FIX=false
ALL=false
for arg in "$@"; do
  case "$arg" in
    --fix) FIX=true ;;
    --all) ALL=true ;;
    *) echo "error: unknown option '$arg' (use --fix and/or --all)" >&2; exit 2 ;;
  esac
done

files=()
if $ALL; then
  label="all files"
  while IFS= read -r f; do
    files+=("$f")
  done < <({ git ls-files -- src tests run.py; git ls-files --others --exclude-standard -- src tests; } | grep '\.py$' | sort -u || true)
else
  if ! git rev-parse --verify --quiet "$BASE_REF^{commit}" >/dev/null; then
    echo "error: base ref '$BASE_REF' not found." >&2
    echo "       Run 'git fetch origin main', or set BASE_REF (e.g. BASE_REF=origin/staging)." >&2
    exit 2
  fi
  base="$(git merge-base HEAD "$BASE_REF")"
  label="new or modified file(s) vs $BASE_REF"

  # Python files under src/, tests/ and run.py that differ from the merge base
  # (committed, staged or unstaged) plus untracked ones; deleted files excluded.
  # A read loop instead of `mapfile`, which Bash 3.2 (macOS default) lacks.
  while IFS= read -r f; do
    [ -f "$f" ] && files+=("$f")
  done < <(
    {
      git diff --name-only --relative --diff-filter=ACMR "$base" -- src tests run.py
      git ls-files --others --exclude-standard -- src tests
    } | grep '\.py$' | sort -u || true
  )
fi

if [ "${#files[@]}" -eq 0 ]; then
  echo "==> No new or modified Python files under src/, tests/ or run.py (vs $BASE_REF); skipping ruff and pyright"
else
  echo "==> ${#files[@]} $label:"
  printf '    %s\n' "${files[@]}"

  if $FIX; then
    echo "==> Applying fixes (ruff check --fix, ruff format)"
    "$UV" run ruff check --fix "${files[@]}"
    "$UV" run ruff format "${files[@]}"
  fi

  echo "==> Checking formatting (ruff format --check)"
  "$UV" run ruff format --check "${files[@]}"

  echo "==> Linting and import order (ruff check)"
  "$UV" run ruff check "${files[@]}"

  echo "==> Type checking (pyright)"
  "$UV" run pyright "${files[@]}"
fi

if [ -z "${SKIP_TESTS:-}" ]; then
  echo "==> Running tests"
  # shellcheck disable=SC2086  # PYTEST_ARGS is split into separate options on purpose
  "$UV" run pytest ${PYTEST_ARGS:-}
fi

echo "==> All checks passed"
