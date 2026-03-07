#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/git-commit-and-push.sh -m "commit message" [options]

Options:
  -m, --message <msg>     Commit message (required)
  --branch <name>         Working branch to use on protected branch
  --add-all               Run git add -A before commit (default behavior)
  --staged-only           Commit only already staged files
  --yes                   Skip interactive commit confirmation
  -h, --help              Show this help

Rules:
  - Protected branches: main, master
  - Default add behavior: auto-stage all changes (git add -A)
  - Uses git branch -d style safety (no force operations)
EOF
}

COMMIT_MESSAGE=""
TARGET_BRANCH=""
NO_ADD=0
AUTO_CONFIRM=0

to_slug() {
  local input="$1"
  local slug
  slug="$(printf '%s' "${input}" | tr '[:upper:]' '[:lower:]' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g; s/[^a-z0-9]+/-/g; s/^-+|-+$//g; s/-+/-/g')"
  if [[ -z "${slug}" ]]; then
    slug="update"
  fi
  printf '%s' "${slug}"
}

infer_branch_prefix() {
  local message="$1"
  local cc_type=""
  cc_type="$(printf '%s' "${message}" | sed -nE 's/^([a-z]+)(\([^)]+\))?:.*/\1/p' | head -n1)"

  case "${cc_type}" in
    feat) printf 'feature' ;;
    fix) printf 'fix' ;;
    docs) printf 'docs' ;;
    refactor) printf 'refactor' ;;
    test) printf 'test' ;;
    chore) printf 'chore' ;;
    *) printf 'feature' ;;
  esac
}

is_protected_branch() {
  local branch="$1"
  case "${branch}" in
    main|master)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

choose_branch_from_protected() {
  local protected_branch="$1"
  local seed title_or_message prefix summary_slug date_suffix
  local rec1 rec2 rec3 selection custom_branch

  seed="${COMMIT_MESSAGE}"
  prefix="$(infer_branch_prefix "${COMMIT_MESSAGE}")"
  title_or_message="$(printf '%s' "${seed}" | sed -E 's/^[a-z]+(\([^)]+\))?:[[:space:]]*//')"
  summary_slug="$(to_slug "${title_or_message}")"
  date_suffix="$(date +%Y%m%d)"

  rec1="${prefix}/${summary_slug}"
  rec2="${prefix}/${summary_slug}-${date_suffix}"
  rec3="feature/${summary_slug}"

  if [[ -n "${TARGET_BRANCH}" ]]; then
    if is_protected_branch "${TARGET_BRANCH}"; then
      echo "Protected branch is not allowed: ${TARGET_BRANCH}" >&2
      exit 1
    fi
    if ! git check-ref-format --branch "${TARGET_BRANCH}" >/dev/null 2>&1; then
      echo "Invalid branch name: ${TARGET_BRANCH}" >&2
      exit 1
    fi
    printf '%s' "${TARGET_BRANCH}"
    return
  fi

  if [[ ! -t 0 ]]; then
    echo "You are on a protected branch. In non-interactive mode, pass --branch <name>." >&2
    exit 1
  fi

  cat <<EOF
Current branch is '${protected_branch}'. Continue on a feature branch instead.
Choose a branch name to continue:
  1) ${rec1}
  2) ${rec2}
  3) ${rec3}
  4) Enter custom branch name
EOF

  while true; do
    read -r -p "Select [1-4]: " selection
    case "${selection}" in
      1) printf '%s' "${rec1}"; return ;;
      2) printf '%s' "${rec2}"; return ;;
      3) printf '%s' "${rec3}"; return ;;
      4)
        read -r -p "Custom branch name: " custom_branch
        if [[ -z "${custom_branch}" ]]; then
          echo "Branch name cannot be empty." >&2
          continue
        fi
        if is_protected_branch "${custom_branch}"; then
          echo "Protected branch is not allowed: ${custom_branch}" >&2
          continue
        fi
        if ! git check-ref-format --branch "${custom_branch}" >/dev/null 2>&1; then
          echo "Invalid branch name: ${custom_branch}" >&2
          continue
        fi
        printf '%s' "${custom_branch}"
        return
        ;;
      *)
        echo "Please choose 1, 2, 3, or 4." >&2
        ;;
    esac
  done
}

confirm_commit_scope() {
  if git diff --cached --quiet; then
    echo "No staged changes found. Nothing to commit." >&2
    exit 1
  fi

  echo "Staged files to commit:"
  git diff --cached --name-status

  if [[ "${AUTO_CONFIRM}" -eq 1 ]]; then
    return
  fi

  if [[ ! -t 0 ]]; then
    echo "Non-interactive mode requires --yes to commit." >&2
    exit 1
  fi

  local answer
  read -r -p "Proceed with commit? [y/N]: " answer
  case "${answer}" in
    y|Y|yes|YES)
      ;;
    *)
      echo "Commit cancelled." >&2
      exit 1
      ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--message)
      COMMIT_MESSAGE="${2:-}"
      shift 2
      ;;
    --branch)
      TARGET_BRANCH="${2:-}"
      shift 2
      ;;
    --add-all)
      NO_ADD=0
      shift
      ;;
    --staged-only)
      NO_ADD=1
      shift
      ;;
    --yes)
      AUTO_CONFIRM=1
      shift
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

if [[ -z "${COMMIT_MESSAGE}" ]]; then
  echo "Commit message is required." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "This script must run inside a git repository." >&2
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [[ -z "${CURRENT_BRANCH}" ]]; then
  echo "Detached HEAD is not supported. Checkout a branch first." >&2
  exit 1
fi

if is_protected_branch "${CURRENT_BRANCH}"; then
  TARGET_BRANCH="$(choose_branch_from_protected "${CURRENT_BRANCH}")"
  if git show-ref --verify --quiet "refs/heads/${TARGET_BRANCH}"; then
    git switch "${TARGET_BRANCH}"
  else
    git switch -c "${TARGET_BRANCH}"
  fi
  CURRENT_BRANCH="${TARGET_BRANCH}"
  echo "Switched to branch: ${CURRENT_BRANCH}"
fi

if [[ "${NO_ADD}" -eq 0 ]]; then
  git add -A
fi

confirm_commit_scope
git commit -m "${COMMIT_MESSAGE}"

echo "Pushing ${CURRENT_BRANCH} to origin..."
git push origin "${CURRENT_BRANCH}"
echo "Done."
