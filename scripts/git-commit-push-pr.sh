#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
AUTH_FILE="${REPO_ROOT}/.local/github-auth.env"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/git-commit-push-pr.sh -m "commit message" [options]
  bash scripts/git-commit-push-pr.sh --no-commit [options]

Options:
  -m, --message <msg>     Commit message (required unless --no-commit)
  --base <branch>         PR base branch (default: origin's default branch, fallback main)
  --branch <name>         Working branch to use (required in non-interactive mode on protected branch)
  --title <title>         PR title
  --body <text>           PR body text
  --body-file <path>      PR body file path
  --draft                 Create PR as draft
  --add-all               Run git add -A before commit (default behavior)
  --staged-only           Commit only already staged files
  --yes                   Skip interactive commit confirmation
  --no-commit             Skip git add/commit and only push + create PR
  --no-add                Deprecated alias of --staged-only
  -h, --help              Show this help

Default PR body behavior:
  - If --body / --body-file is not provided, use existing PR template file when found.
  - If template is not found, fallback to gh --fill.

Required local auth file (project-only):
  .local/github-auth.env

File format:
  GITHUB_USERNAME=your-github-username
  GH_TOKEN=gho_xxx
EOF
}

COMMIT_MESSAGE=""
BASE_BRANCH=""
TARGET_BRANCH=""
PR_TITLE=""
PR_BODY=""
PR_BODY_FILE=""
GENERATED_PR_BODY_FILE=""
DO_DRAFT=0
NO_COMMIT=0
NO_ADD=0
AUTO_CONFIRM=0
EXPECTED_REPO_DEFAULT="3balljugglerYu/ai_coordinate"
EXPECTED_REPO="${EXPECTED_REPO:-${EXPECTED_REPO_DEFAULT}}"

to_slug() {
  local input="$1"
  local slug
  slug="$(printf '%s' "${input}" | tr '[:upper:]' '[:lower:]' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g; s/[^a-z0-9]+/-/g; s/^-+|-+$//g; s/-+/-/g')"
  if [[ -z "${slug}" ]]; then
    slug="update"
  fi
  printf '%s' "${slug}"
}

parse_repo_slug() {
  local remote_url="$1"
  printf '%s' "${remote_url}" | sed -E 's#^https://github.com/([^/]+/[^/.]+)(\.git)?$#\1#; s#^git@github.com:([^/]+/[^/.]+)(\.git)?$#\1#'
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

choose_branch_from_protected() {
  local protected_branch="$1"
  local seed title_or_message prefix summary_slug date_suffix
  local rec1 rec2 rec3 selection custom_branch

  seed="${PR_TITLE:-${COMMIT_MESSAGE}}"
  prefix="$(infer_branch_prefix "${COMMIT_MESSAGE}")"
  title_or_message="${seed}"
  title_or_message="$(printf '%s' "${title_or_message}" | sed -E 's/^[a-z]+(\([^)]+\))?:[[:space:]]*//')"
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

load_auth_value() {
  local key="$1"
  local raw
  raw="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "${AUTH_FILE}" | tail -n1 || true)"
  if [[ -z "${raw}" ]]; then
    return 1
  fi

  raw="${raw#*=}"
  raw="$(printf '%s' "${raw}" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"

  # Strip optional surrounding double quotes.
  if [[ "${raw}" == \"*\" && "${raw}" == *\" && "${#raw}" -ge 2 ]]; then
    raw="${raw:1:${#raw}-2}"
  fi

  printf '%s' "${raw}"
}

find_pr_template_file() {
  local candidate
  local direct_candidates=(
    ".github/pull_request_template.md"
    ".github/PULL_REQUEST_TEMPLATE.md"
    ".github/pull_request_template.txt"
    ".github/PULL_REQUEST_TEMPLATE.txt"
  )

  for candidate in "${direct_candidates[@]}"; do
    if [[ -f "${REPO_ROOT}/${candidate}" ]]; then
      printf '%s' "${REPO_ROOT}/${candidate}"
      return 0
    fi
  done

  if [[ -d "${REPO_ROOT}/.github/PULL_REQUEST_TEMPLATE" ]]; then
    candidate="$(find "${REPO_ROOT}/.github/PULL_REQUEST_TEMPLATE" -type f \( -name '*.md' -o -name '*.txt' \) | sort | head -n1 || true)"
    if [[ -n "${candidate}" ]]; then
      printf '%s' "${candidate}"
      return 0
    fi
  fi

  return 1
}

strip_commit_prefix() {
  local input="$1"
  printf '%s' "${input}" | sed -E 's/^[a-z]+(\([^)]+\))?:[[:space:]]*//'
}

collect_pr_changed_files() {
  local files
  files="$(git diff --name-only --diff-filter=ACMRT "${BASE_BRANCH}...${CURRENT_BRANCH}" 2>/dev/null || true)"
  if [[ -n "${files}" ]]; then
    printf '%s\n' "${files}" | sed '/^$/d'
    return
  fi

  git show --name-only --pretty='' HEAD 2>/dev/null | sed '/^$/d'
}

build_pr_change_bullets() {
  local files
  files="$(collect_pr_changed_files)"
  if [[ -z "${files}" ]]; then
    printf '%s\n' "- 変更ファイルの取得に失敗しました。必要に応じて追記してください。"
    return
  fi

  printf '%s\n' "${files}" | head -n 12 | while IFS= read -r file; do
    printf -- '- `%s`\n' "${file}"
  done
}

build_pr_test_method_bullets() {
  local files test_files joined
  files="$(collect_pr_changed_files)"
  test_files="$(printf '%s\n' "${files}" | grep -E '^tests/.*\.test\.[a-z0-9]+$' || true)"
  if [[ -n "${test_files}" ]]; then
    joined="$(printf '%s\n' "${test_files}" | tr '\n' ' ' | sed -E 's/[[:space:]]+$//')"
    printf -- '- 自動テスト: `npm test -- %s`\n' "${joined}"
    return
  fi

  printf '%s\n' "- 自動テスト: 未実施（必要に応じて追記してください）"
}

build_device_checklist_from_template() {
  local template_file="$1"
  local section
  section="$(
    awk '
      /^### 実機テスト$/ { flag=1; next }
      /^### / { if (flag) exit }
      flag { print }
    ' "${template_file}" | sed -E '/^[[:space:]]*<!--.*-->[[:space:]]*$/d'
  )"

  if [[ -n "${section//[[:space:]]/}" ]]; then
    printf '%s\n' "${section}"
    return
  fi

  cat <<'EOF'
- [ ] iOS Safari で主要導線を確認
- [ ] Android Chrome で主要導線を確認
- [ ] PC（Chrome）で主要導線を確認
- [ ] レスポンシブ表示崩れがないことを確認
- [ ] エラーメッセージやバリデーション表示を確認
EOF
}

build_pr_body_from_template() {
  local template_file="$1"
  local output_file summary_source summary_text change_bullets test_bullets device_checklist

  summary_source="${PR_TITLE:-$(git log -1 --pretty=%s 2>/dev/null || true)}"
  summary_text="$(strip_commit_prefix "${summary_source}")"
  summary_text="${summary_text:-${CURRENT_BRANCH}}"
  change_bullets="$(build_pr_change_bullets)"
  test_bullets="$(build_pr_test_method_bullets)"
  device_checklist="$(build_device_checklist_from_template "${template_file}")"

  output_file="$(mktemp)"
  cat > "${output_file}" <<EOF
### 概要
${summary_text}

### 変更内容
${change_bullets}

### 実機テスト
${device_checklist}

### テスト方法
${test_bullets}
EOF

  printf '%s' "${output_file}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--message)
      COMMIT_MESSAGE="${2:-}"
      shift 2
      ;;
    --base)
      BASE_BRANCH="${2:-}"
      shift 2
      ;;
    --branch)
      TARGET_BRANCH="${2:-}"
      shift 2
      ;;
    --title)
      PR_TITLE="${2:-}"
      shift 2
      ;;
    --body)
      PR_BODY="${2:-}"
      shift 2
      ;;
    --body-file)
      PR_BODY_FILE="${2:-}"
      shift 2
      ;;
    --draft)
      DO_DRAFT=1
      shift
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
    --no-commit)
      NO_COMMIT=1
      shift
      ;;
    --no-add)
      # Backward compatibility alias.
      NO_ADD=1
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

if [[ -n "${PR_BODY}" && -n "${PR_BODY_FILE}" ]]; then
  echo "Use either --body or --body-file, not both." >&2
  exit 1
fi

if [[ ! -f "${AUTH_FILE}" ]]; then
  cat >&2 <<EOF
Missing auth file: ${AUTH_FILE}
Create it from template:
  cp scripts/github-auth.env.example .local/github-auth.env
EOF
  exit 1
fi

if ! GITHUB_USERNAME="$(load_auth_value "GITHUB_USERNAME")"; then
  echo "GITHUB_USERNAME is required in ${AUTH_FILE}" >&2
  exit 1
fi
if ! GH_TOKEN="$(load_auth_value "GH_TOKEN")"; then
  echo "GH_TOKEN is required in ${AUTH_FILE}" >&2
  exit 1
fi
if [[ -z "${GITHUB_USERNAME}" || -z "${GH_TOKEN}" ]]; then
  echo "GITHUB_USERNAME and GH_TOKEN are required in ${AUTH_FILE}" >&2
  exit 1
fi

cd "${REPO_ROOT}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "This script must run inside a git repository." >&2
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [[ -z "${CURRENT_BRANCH}" ]]; then
  echo "Detached HEAD is not supported. Checkout a branch first." >&2
  exit 1
fi

ORIGIN_URL="$(git remote get-url origin 2>/dev/null || true)"
if [[ -z "${ORIGIN_URL}" ]]; then
  echo "Remote 'origin' is not configured." >&2
  exit 1
fi

REPO_SLUG="$(parse_repo_slug "${ORIGIN_URL}")"
if [[ -z "${REPO_SLUG}" || "${REPO_SLUG}" == "${ORIGIN_URL}" ]]; then
  echo "Unable to determine GitHub repository slug from origin URL: ${ORIGIN_URL}" >&2
  exit 1
fi

if [[ "${REPO_SLUG}" != "${EXPECTED_REPO}" ]]; then
  echo "Safety stop: origin points to '${REPO_SLUG}', expected '${EXPECTED_REPO}'." >&2
  echo "If this is intentional, rerun with EXPECTED_REPO=${REPO_SLUG}." >&2
  exit 1
fi

if is_protected_branch "${CURRENT_BRANCH}"; then
  TARGET_BRANCH="$(choose_branch_from_protected "${CURRENT_BRANCH}")"
  if is_protected_branch "${TARGET_BRANCH}"; then
    echo "Refusing to continue on protected branch: ${TARGET_BRANCH}" >&2
    exit 1
  fi

  if git show-ref --verify --quiet "refs/heads/${TARGET_BRANCH}"; then
    git switch "${TARGET_BRANCH}"
  else
    git switch -c "${TARGET_BRANCH}"
  fi
  CURRENT_BRANCH="${TARGET_BRANCH}"
  echo "Switched to branch: ${CURRENT_BRANCH}"
fi

if [[ -z "${BASE_BRANCH}" ]]; then
  BASE_BRANCH="$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p' | head -n1 || true)"
  BASE_BRANCH="${BASE_BRANCH:-main}"
fi

if [[ "${NO_COMMIT}" -eq 0 ]]; then
  if [[ -z "${COMMIT_MESSAGE}" ]]; then
    echo "Commit message is required unless --no-commit is specified." >&2
    exit 1
  fi

  if [[ "${NO_ADD}" -eq 0 ]]; then
    git add -A
  fi

  confirm_commit_scope
  git commit -m "${COMMIT_MESSAGE}"
fi

ASKPASS_FILE="$(mktemp)"
cleanup() {
  rm -f "${ASKPASS_FILE}"
  if [[ -n "${GENERATED_PR_BODY_FILE}" ]]; then
    rm -f "${GENERATED_PR_BODY_FILE}"
  fi
}
trap cleanup EXIT

cat > "${ASKPASS_FILE}" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  *Username*) printf '%s\n' "$GITHUB_USERNAME" ;;
  *Password*) printf '%s\n' "$GH_TOKEN" ;;
  *) printf '\n' ;;
esac
EOF
chmod 700 "${ASKPASS_FILE}"

echo "Pushing ${CURRENT_BRANCH} to origin..."
GITHUB_USERNAME="${GITHUB_USERNAME}" \
GH_TOKEN="${GH_TOKEN}" \
GIT_ASKPASS="${ASKPASS_FILE}" \
GIT_TERMINAL_PROMPT=0 \
git push origin "${CURRENT_BRANCH}"

PR_LIST_ARGS=(pr list --head "${CURRENT_BRANCH}" --state open --json url --jq '.[0].url')
if [[ "${REPO_SLUG}" == */* ]]; then
  PR_LIST_ARGS+=(--repo "${REPO_SLUG}")
fi

EXISTING_PR_URL="$(GH_TOKEN="${GH_TOKEN}" gh "${PR_LIST_ARGS[@]}" 2>/dev/null || true)"
if [[ -n "${EXISTING_PR_URL}" && "${EXISTING_PR_URL}" != "null" ]]; then
  echo "Open PR already exists: ${EXISTING_PR_URL}"
  exit 0
fi

PR_CREATE_ARGS=(pr create --base "${BASE_BRANCH}" --head "${CURRENT_BRANCH}")
if [[ "${REPO_SLUG}" == */* ]]; then
  PR_CREATE_ARGS+=(--repo "${REPO_SLUG}")
fi

if [[ -z "${PR_BODY}" && -z "${PR_BODY_FILE}" ]]; then
  TEMPLATE_FILE="$(find_pr_template_file || true)"
  if [[ -n "${TEMPLATE_FILE}" ]]; then
    if [[ -z "${PR_TITLE}" ]]; then
      PR_TITLE="$(git log -1 --pretty=%s 2>/dev/null || true)"
      PR_TITLE="${PR_TITLE:-${CURRENT_BRANCH}}"
    fi
    GENERATED_PR_BODY_FILE="$(build_pr_body_from_template "${TEMPLATE_FILE}")"
    PR_BODY_FILE="${GENERATED_PR_BODY_FILE}"
    echo "Using PR template with auto-filled body: ${TEMPLATE_FILE}"
  fi
fi

if [[ "${DO_DRAFT}" -eq 1 ]]; then
  PR_CREATE_ARGS+=(--draft)
fi
if [[ -n "${PR_TITLE}" ]]; then
  PR_CREATE_ARGS+=(--title "${PR_TITLE}")
fi
if [[ -n "${PR_BODY}" ]]; then
  PR_CREATE_ARGS+=(--body "${PR_BODY}")
fi
if [[ -n "${PR_BODY_FILE}" ]]; then
  PR_CREATE_ARGS+=(--body-file "${PR_BODY_FILE}")
fi
if [[ -z "${PR_TITLE}" && -z "${PR_BODY}" && -z "${PR_BODY_FILE}" ]]; then
  PR_CREATE_ARGS+=(--fill)
fi

PR_URL="$(GH_TOKEN="${GH_TOKEN}" gh "${PR_CREATE_ARGS[@]}")"
echo "PR created: ${PR_URL}"
