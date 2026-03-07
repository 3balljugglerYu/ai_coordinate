#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/post-merge-cleanup.sh [--base <branch>]

Description:
  1) Remember current branch as source branch
  2) Switch to base branch (default: main)
  3) Pull latest from origin with --ff-only
  4) Check whether origin/source-branch is deleted
  5) Delete local source branch only if remote branch is already deleted

Rules:
  - If pull fails, script stops immediately.
  - If remote source branch still exists, script stops without deleting local branch.
  - Uses `git branch -d` (non-force).
EOF
}

BASE_BRANCH="main"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      BASE_BRANCH="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "This script must run inside a git repository." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit/stash changes before cleanup." >&2
  exit 1
fi

SOURCE_BRANCH="$(git branch --show-current)"
if [[ -z "${SOURCE_BRANCH}" ]]; then
  echo "Detached HEAD is not supported." >&2
  exit 1
fi

if [[ "${SOURCE_BRANCH}" == "${BASE_BRANCH}" ]]; then
  echo "Current branch is already '${BASE_BRANCH}'. No source branch to clean up." >&2
  exit 1
fi

echo "Source branch: ${SOURCE_BRANCH}"
echo "Switching to ${BASE_BRANCH}..."
git switch "${BASE_BRANCH}"

echo "Pulling latest ${BASE_BRANCH} from origin..."
git pull --ff-only origin "${BASE_BRANCH}"

echo "Checking remote branch deletion: origin/${SOURCE_BRANCH}"
if git ls-remote --exit-code --heads origin "${SOURCE_BRANCH}" >/dev/null 2>&1; then
  echo "Remote branch still exists: origin/${SOURCE_BRANCH}"
  echo "Stopping without deleting local branch."
  exit 0
fi

echo "Remote branch is deleted. Deleting local branch: ${SOURCE_BRANCH}"
git branch -d "${SOURCE_BRANCH}"
echo "Done."

