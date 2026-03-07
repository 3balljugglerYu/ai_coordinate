#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/git-create-branch.sh [options]

Options:
  --base <branch>     Base branch to require (default: main)
  --dry-run           Print suggested branch and exit
  -h, --help          Show this help

Behavior:
  - If current branch is not base branch, exit without changes.
  - If current branch is base branch, inspect local changes and create a branch name.
  - Branch name format: <prefix>/<slug>
EOF
}

BASE_BRANCH="main"
DRY_RUN=0

to_slug() {
  local input="$1"
  local slug
  slug="$(printf '%s' "${input}" | tr '[:upper:]' '[:lower:]' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g; s/[^a-z0-9]+/-/g; s/^-+|-+$//g; s/-+/-/g')"
  if [[ -z "${slug}" ]]; then
    slug="update"
  fi
  printf '%s' "${slug}"
}

collect_changed_paths() {
  git status --porcelain | while IFS= read -r line; do
    local path
    [[ -z "${line}" ]] && continue
    path="${line:3}"
    if [[ "${path}" == *" -> "* ]]; then
      path="${path##* -> }"
    fi
    path="${path#\"}"
    path="${path%\"}"
    printf '%s\n' "${path}"
  done | sed '/^$/d' | sort -u
}

classify_prefix() {
  local paths=("$@")
  local all_docs=1
  local all_tests=1
  local all_chore=1
  local path

  if [[ "${#paths[@]}" -eq 0 ]]; then
    printf 'feature'
    return
  fi

  for path in "${paths[@]}"; do
    if [[ ! "${path}" =~ (^docs/|^\.agents/|\.md$|\.mdx$) ]]; then
      all_docs=0
    fi

    if [[ ! "${path}" =~ (^tests/|\.test\.[^.]+$|\.spec\.[^.]+$|/__tests__/) ]]; then
      all_tests=0
    fi

    case "${path}" in
      scripts/*|.github/*|package.json|package-lock.json|pnpm-lock.yaml|yarn.lock|bun.lockb|tsconfig*.json|*.config.*|.eslintrc*|.prettierrc*|Makefile)
        ;;
      *)
        all_chore=0
        ;;
    esac
  done

  if [[ "${all_docs}" -eq 1 ]]; then
    printf 'docs'
    return
  fi
  if [[ "${all_tests}" -eq 1 ]]; then
    printf 'test'
    return
  fi
  if [[ "${all_chore}" -eq 1 ]]; then
    printf 'chore'
    return
  fi
  printf 'feature'
}

slug_from_path() {
  local path="$1"
  local stripped slug

  stripped="$(printf '%s' "${path}" | sed -E 's#^\./##; s#^\.agents/skills/##; s#^docs/##; s#^tests/##; s#^app/##; s#^features/##; s#^components/##; s#^lib/##; s#^scripts/##; s#\.[A-Za-z0-9]+$##')"
  slug="$(to_slug "${stripped}")"
  slug="$(printf '%s' "${slug}" | awk -F- '{out=$1; for(i=2;i<=NF && i<=6;i++) out=out "-" $i; print out}')"

  if [[ -z "${slug}" ]]; then
    slug="update"
  fi
  printf '%s' "${slug:0:50}"
}

branch_exists() {
  local branch="$1"
  if git show-ref --verify --quiet "refs/heads/${branch}"; then
    return 0
  fi
  if git remote get-url origin >/dev/null 2>&1; then
    git ls-remote --exit-code --heads origin "${branch}" >/dev/null 2>&1 && return 0
  fi
  return 1
}

resolve_branch_name() {
  local base="$1"
  local candidate="${base}"
  local date_suffix counter

  if ! branch_exists "${candidate}"; then
    printf '%s' "${candidate}"
    return
  fi

  date_suffix="$(date +%Y%m%d)"
  candidate="${base}-${date_suffix}"
  counter=2
  while branch_exists "${candidate}"; do
    candidate="${base}-${date_suffix}-${counter}"
    counter=$((counter + 1))
  done
  printf '%s' "${candidate}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      BASE_BRANCH="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
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

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "This script must run inside a git repository." >&2
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [[ -z "${CURRENT_BRANCH}" ]]; then
  echo "Detached HEAD is not supported." >&2
  exit 1
fi

if [[ "${CURRENT_BRANCH}" != "${BASE_BRANCH}" ]]; then
  echo "Current branch is '${CURRENT_BRANCH}'. Not on '${BASE_BRANCH}'. Exiting without changes."
  exit 0
fi

CHANGED_PATHS=()
while IFS= read -r changed_path; do
  CHANGED_PATHS+=("${changed_path}")
done < <(collect_changed_paths)

if [[ "${#CHANGED_PATHS[@]}" -eq 0 ]]; then
  PREFIX="feature"
  SLUG="update-$(date +%Y%m%d)"
  REASON="No local changes found. Using fallback branch slug."
else
  PREFIX="$(classify_prefix "${CHANGED_PATHS[@]}")"
  SLUG="$(slug_from_path "${CHANGED_PATHS[0]}")"
  REASON="Derived from changed path: ${CHANGED_PATHS[0]}"
fi

BASE_NAME="${PREFIX}/${SLUG}"
TARGET_BRANCH="$(resolve_branch_name "${BASE_NAME}")"

echo "Current branch: ${CURRENT_BRANCH}"
echo "Suggested branch: ${TARGET_BRANCH}"
echo "${REASON}"

if [[ "${DRY_RUN}" -eq 1 ]]; then
  exit 0
fi

git switch -c "${TARGET_BRANCH}"
echo "Created and switched to branch: ${TARGET_BRANCH}"
