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
  slug="$(
    printf '%s' "${input}" \
      | sed -E 's/([[:lower:][:digit:]])([[:upper:]])/\1-\2/g' \
      | tr '[:upper:]' '[:lower:]' \
      | sed -E 's/^[[:space:]]+|[[:space:]]+$//g; s/[^a-z0-9]+/-/g; s/^-+|-+$//g; s/-+/-/g'
  )"
  if [[ -z "${slug}" ]]; then
    slug="update"
  fi
  printf '%s' "${slug}"
}

normalize_context_token() {
  local token="$1"
  case "${token}" in
    posts)
      printf 'post'
      return
      ;;
    users)
      printf 'user'
      return
      ;;
    images)
      printf 'image'
      return
      ;;
    comments)
      printf 'comment'
      return
      ;;
    notifications)
      printf 'notification'
      return
      ;;
  esac
  printf '%s' "${token}"
}

is_ignored_path() {
  local path="$1"
  case "${path}" in
    .serena/*|supabase/.temp/*)
      return 0
      ;;
  esac
  return 1
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
    if is_ignored_path "${path}"; then
      continue
    fi
    printf '%s\n' "${path}"
  done | sed '/^$/d' | sort -u
}

path_change_score() {
  local path="$1"
  local score=0
  local add del file

  while IFS=$'\t' read -r add del file; do
    [[ "${file}" == "${path}" ]] || continue
    [[ "${add}" =~ ^[0-9]+$ ]] || add=0
    [[ "${del}" =~ ^[0-9]+$ ]] || del=0
    score=$((score + add + del))
  done < <(
    git diff --numstat -- "${path}"
    git diff --cached --numstat -- "${path}"
  )

  if [[ "${score}" -eq 0 ]]; then
    score=1
  fi
  printf '%s' "${score}"
}

pick_primary_path() {
  local paths=("$@")
  local primary_path="${paths[0]}"
  local primary_score
  local current_path current_score

  primary_score="$(path_change_score "${primary_path}")"
  for current_path in "${paths[@]:1}"; do
    current_score="$(path_change_score "${current_path}")"
    if (( current_score > primary_score )); then
      primary_path="${current_path}"
      primary_score="${current_score}"
    fi
  done

  printf '%s' "${primary_path}"
}

context_from_path() {
  local path="$1"
  local stripped raw token normalized
  local context_tokens=()

  stripped="$(printf '%s' "${path}" | sed -E 's#^\./##; s#^\.agents/skills/##; s#^docs/##; s#^tests/##; s#^app/##; s#^features/##; s#^components/##; s#^lib/##; s#^scripts/##; s#\.[A-Za-z0-9]+$##')"

  IFS='/' read -r -a raw_tokens <<< "${stripped}"
  for raw in "${raw_tokens[@]}"; do
    [[ "${raw}" =~ ^\[.*\]$ ]] && continue

    normalized="$(
      printf '%s' "${raw}" \
        | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g; s/-+/-/g'
    )"

    [[ -z "${normalized}" ]] && continue

    case "${normalized}" in
      page|layout|route|loading|index|component|components|lib|utils|util|hooks|hook|client|server|types|shared|readme|id|slug)
        continue
        ;;
    esac

    token="$(normalize_context_token "${normalized}")"
    context_tokens+=("${token}")
    if [[ "${#context_tokens[@]}" -ge 2 ]]; then
      break
    fi
  done

  if [[ "${#context_tokens[@]}" -eq 0 ]]; then
    printf ''
    return
  fi

  (
    IFS='-'
    printf '%s' "${context_tokens[*]}"
  )
}

topic_from_diff() {
  local path="$1"
  local diff_lines topic diff_lower

  diff_lines="$(
    {
      git diff -- "${path}"
      git diff --cached -- "${path}"
    } 2>/dev/null
  )"

  if [[ -z "${diff_lines}" ]]; then
    printf ''
    return
  fi

  topic="$(
    printf '%s\n' "${diff_lines}" \
      | grep -E '^\+\s*(export\s+)?(async\s+)?function\s+[A-Za-z_][A-Za-z0-9_]*' \
      | head -n 1 \
      | sed -E 's/^\+\s*//; s/^export\s+//; s/^async\s+//; s/^function\s+([A-Za-z_][A-Za-z0-9_]*).*/\1/'
  )"
  if [[ -z "${topic}" ]]; then
    topic="$(
      printf '%s\n' "${diff_lines}" \
        | grep -E '^\+\s*(export\s+)?(const|let|var)\s+[A-Za-z_][A-Za-z0-9_]*' \
        | head -n 1 \
        | sed -E 's/^\+\s*//; s/^export\s+//; s/^(const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*).*/\2/'
    )"
  fi
  if [[ -z "${topic}" ]]; then
    topic="$(
      printf '%s\n' "${diff_lines}" \
        | grep -E '^\+\s*throw new Error\(".*"\)' \
        | head -n 1 \
        | sed -E 's/^.*Error\("([^"]+)".*$/\1/'
    )"
  fi

  if [[ -z "${topic}" ]]; then
    diff_lower="$(printf '%s\n' "${diff_lines}" | tr '[:upper:]' '[:lower:]')"

    if printf '%s\n' "${diff_lower}" | grep -Eq 'og:image|ogimage|opengraph|twitter:image|summary_large_image'; then
      if printf '%s\n' "${diff_lower}" | grep -Eq '\bwidth\b' \
        && printf '%s\n' "${diff_lower}" | grep -Eq '\bheight\b'; then
        topic="og-image-aspect-ratio"
      else
        topic="og-image-metadata"
      fi
    elif printf '%s\n' "${diff_lower}" | grep -Eq 'aspect_ratio|aspectratio'; then
      topic="aspect-ratio"
    elif printf '%s\n' "${diff_lower}" | grep -Eq 'canonical'; then
      topic="canonical-metadata"
    elif printf '%s\n' "${diff_lower}" | grep -Eq 'summary_large_image|twitter:image'; then
      topic="share-card-image"
    fi
  fi

  if [[ -z "${topic}" ]]; then
    printf ''
    return
  fi

  printf '%s' "$(to_slug "${topic}")"
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
  PRIMARY_PATH="$(pick_primary_path "${CHANGED_PATHS[@]}")"
  PATH_SLUG="$(slug_from_path "${PRIMARY_PATH}")"
  CONTEXT_SLUG="$(context_from_path "${PRIMARY_PATH}")"
  TOPIC_SLUG="$(topic_from_diff "${PRIMARY_PATH}")"

  if [[ -n "${TOPIC_SLUG}" && "${TOPIC_SLUG}" != "update" ]]; then
    if [[ -n "${CONTEXT_SLUG}" && "${CONTEXT_SLUG}" != "update" ]]; then
      if [[ "${TOPIC_SLUG}" == *"${CONTEXT_SLUG}"* ]]; then
        SLUG="${TOPIC_SLUG}"
      else
        SLUG="$(to_slug "${CONTEXT_SLUG}-${TOPIC_SLUG}")"
        SLUG="${SLUG:0:50}"
      fi
    elif [[ "${PATH_SLUG}" == "update" ]]; then
      SLUG="${TOPIC_SLUG}"
    elif [[ "${PATH_SLUG}" == *"${TOPIC_SLUG}"* ]]; then
      SLUG="${PATH_SLUG}"
    else
      SLUG="$(to_slug "${PATH_SLUG}-${TOPIC_SLUG}")"
      SLUG="${SLUG:0:50}"
    fi
  else
    SLUG="${PATH_SLUG}"
  fi

  REASON="Derived from changed path/content: ${PRIMARY_PATH}"
  if [[ -n "${CONTEXT_SLUG}" ]]; then
    REASON="${REASON} (context=${CONTEXT_SLUG})"
  fi
  if [[ -n "${TOPIC_SLUG}" ]]; then
    REASON="${REASON} (topic=${TOPIC_SLUG})"
  fi
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
