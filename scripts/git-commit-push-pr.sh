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
TEST_RESULT_STATUS="not_run"
TEST_RESULT_COMMAND=""
TEST_RESULT_SUITES_LINE=""
TEST_RESULT_TESTS_LINE=""
TEST_RESULT_FAILED_ITEMS=""
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

collect_changed_test_files() {
  collect_pr_changed_files | grep -E '^tests/.*\.(test|spec)\.[A-Za-z0-9]+$' || true
}

collect_pr_diff_for_path() {
  local path="$1"
  local diff_output=""

  if [[ -n "${BASE_BRANCH:-}" && -n "${CURRENT_BRANCH:-}" ]]; then
    diff_output="$(git diff "${BASE_BRANCH}...${CURRENT_BRANCH}" -- "${path}" 2>/dev/null || true)"
  fi

  if [[ -z "${diff_output}" ]]; then
    diff_output="$(
      {
        git diff -- "${path}"
        git diff --cached -- "${path}"
      } 2>/dev/null
    )"
  fi

  printf '%s' "${diff_output}"
}

normalize_pr_context_token() {
  local token="$1"
  case "${token}" in
    posts) printf 'post' ;;
    users) printf 'user' ;;
    images) printf 'image' ;;
    comments) printf 'comment' ;;
    notifications) printf 'notification' ;;
    tests) printf 'test' ;;
    *) printf '%s' "${token}" ;;
  esac
}

pick_primary_pr_path() {
  local files=()
  local candidate best

  while IFS= read -r candidate; do
    [[ -n "${candidate}" ]] && files+=("${candidate}")
  done < <(collect_pr_changed_files)

  if [[ "${#files[@]}" -eq 0 ]]; then
    printf ''
    return
  fi

  best="${files[0]}"
  for candidate in "${files[@]}"; do
    case "${candidate}" in
      app/*|features/*|components/*|lib/*)
        best="${candidate}"
        break
        ;;
    esac
  done

  printf '%s' "${best}"
}

context_from_pr_path() {
  local path="$1"
  local stripped raw normalized token
  local tokens=()

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
      page|layout|route|loading|index|component|components|lib|utils|util|hooks|hook|client|server|types|shared|readme|id|slug|marketing|app)
        continue
        ;;
    esac

    token="$(normalize_pr_context_token "${normalized}")"
    tokens+=("${token}")
    if [[ "${#tokens[@]}" -ge 2 ]]; then
      break
    fi
  done

  if [[ "${#tokens[@]}" -eq 0 ]]; then
    printf ''
    return
  fi

  (
    IFS='-'
    printf '%s' "${tokens[*]}"
  )
}

diff_topic_from_path() {
  local path="$1"
  local diff_lines diff_lower

  diff_lines="$(collect_pr_diff_for_path "${path}")"

  if [[ -z "${diff_lines}" ]]; then
    printf ''
    return
  fi

  diff_lower="$(printf '%s\n' "${diff_lines}" | tr '[:upper:]' '[:lower:]')"

  if printf '%s\n' "${diff_lower}" | grep -Eq 'og:image|ogimage|opengraph|twitter:image|summary_large_image'; then
    if printf '%s\n' "${diff_lower}" | grep -Eq '\bwidth\b' \
      && printf '%s\n' "${diff_lower}" | grep -Eq '\bheight\b'; then
      printf '%s' 'og-image-aspect-ratio'
      return
    fi
    printf '%s' 'og-image-metadata'
    return
  fi

  if printf '%s\n' "${diff_lower}" | grep -Eq 'canonical'; then
    printf '%s' 'canonical-metadata'
    return
  fi

  if printf '%s\n' "${diff_lower}" | grep -Eq 'aspect_ratio|aspectratio|naturalheight|naturalwidth'; then
    printf '%s' 'image-aspect-ratio'
    return
  fi

  case "${path}" in
    *.md|*.mdx)
      printf '%s' 'docs'
      return
      ;;
    tests/*|*.test.*|*.spec.*)
      printf '%s' 'tests'
      return
      ;;
    app/api/*)
      printf '%s' 'api'
      return
      ;;
  esac

  printf ''
}

collect_changed_symbols_for_path() {
  local path="$1"

  collect_pr_diff_for_path "${path}" \
    | grep -E '^[ +-][[:space:]]*(export[[:space:]]+)?(async[[:space:]]+)?function[[:space:]]+[A-Za-z_][A-Za-z0-9_]*|^[ +-][[:space:]]*(export[[:space:]]+)?(const|let|var)[[:space:]]+[A-Za-z_][A-Za-z0-9_]*|^[ +-][[:space:]]*class[[:space:]]+[A-Za-z_][A-Za-z0-9_]*|^[ +-][[:space:]]*interface[[:space:]]+[A-Za-z_][A-Za-z0-9_]*|^[ +-][[:space:]]*type[[:space:]]+[A-Za-z_][A-Za-z0-9_]*' \
    | sed -E 's/^[ +-][[:space:]]*//; s/^export[[:space:]]+//; s/^async[[:space:]]+//' \
    | sed -E 's/^function[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\1/; s/^(const|let|var)[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\2/; s/^class[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\1/; s/^interface[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\1/; s/^type[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\1/' \
    | sort -u \
    | head -n 3
}

build_primary_change_summary() {
  local primary_path context_slug topic_slug symbol target

  primary_path="$(pick_primary_pr_path)"
  if [[ -z "${primary_path}" ]]; then
    printf ''
    return
  fi

  context_slug="$(context_from_pr_path "${primary_path}")"
  topic_slug="$(diff_topic_from_path "${primary_path}")"
  symbol="$(collect_changed_symbols_for_path "${primary_path}" | head -n 1 || true)"
  target="\`${primary_path}\`"

  if [[ -n "${symbol}" ]]; then
    target="${target} の \`${symbol}\`"
  fi

  case "${topic_slug}" in
    og-image-aspect-ratio)
      printf '%s' "${target} で OG画像メタデータから固定サイズ指定を外し、共有カードで実画像と不整合なアスペクト比が出ないよう調整"
      return
      ;;
    og-image-metadata)
      printf '%s' "${target} で OG画像メタデータの生成ロジックを調整"
      return
      ;;
    canonical-metadata)
      printf '%s' "${target} で canonical メタデータの生成を調整"
      return
      ;;
    image-aspect-ratio)
      printf '%s' "${target} で 画像アスペクト比の扱いを調整"
      return
      ;;
    docs)
      printf '%s' "\`${primary_path}\` を更新"
      return
      ;;
    tests)
      printf '%s' "\`${primary_path}\` のテストケースを追加・更新"
      return
      ;;
    api)
      printf '%s' "${target} で API 実装を更新"
      return
      ;;
  esac

  case "${context_slug}" in
    post)
      printf '%s' "${target} で投稿関連の実装を更新"
      ;;
    user)
      printf '%s' "${target} でユーザー関連の実装を更新"
      ;;
    test)
      printf '%s' "\`${primary_path}\` のテストを更新"
      ;;
    *)
      printf '%s' "${target} を更新"
      ;;
  esac
}

build_inferred_pr_title() {
  local primary_path context_slug topic_slug

  primary_path="$(pick_primary_pr_path)"
  if [[ -z "${primary_path}" ]]; then
    printf ''
    return
  fi

  context_slug="$(context_from_pr_path "${primary_path}")"
  topic_slug="$(diff_topic_from_path "${primary_path}")"

  case "${topic_slug}" in
    og-image-aspect-ratio)
      case "${context_slug}" in
        post) printf '%s' '投稿のOG画像メタデータを実画像に合わせて調整' ;;
        *) printf '%s' 'OG画像メタデータのアスペクト比指定を調整' ;;
      esac
      return
      ;;
    og-image-metadata)
      case "${context_slug}" in
        post) printf '%s' '投稿のOG画像メタデータ生成を調整' ;;
        *) printf '%s' 'OG画像メタデータの生成を調整' ;;
      esac
      return
      ;;
    canonical-metadata)
      printf '%s' 'canonical メタデータの生成を調整'
      return
      ;;
    image-aspect-ratio)
      printf '%s' '画像アスペクト比の扱いを調整'
      return
      ;;
    docs)
      printf '%s' 'ドキュメントを更新'
      return
      ;;
    tests)
      printf '%s' 'テストを追加・更新'
      return
      ;;
    api)
      printf '%s' 'API 実装を更新'
      return
      ;;
  esac

  case "${context_slug}" in
    post) printf '%s' '投稿関連の実装を更新' ;;
    user) printf '%s' 'ユーザー関連の実装を更新' ;;
    test) printf '%s' 'テストを更新' ;;
    *) printf '%s' '実装を更新' ;;
  esac
}

is_generic_summary_text() {
  local input="$1"
  local slug

  slug="$(to_slug "$(strip_commit_prefix "${input}")")"
  case "${slug}" in
    ""|update|updates|fix|fixes|refactor|refactors|chore|chores|docs|tests|changes|misc|wip|minor-fix|minor-fixes)
      return 0
      ;;
  esac

  return 1
}

default_pr_title() {
  local candidate inferred

  candidate="$(git log -1 --pretty=%s 2>/dev/null || true)"
  inferred="$(build_inferred_pr_title)"

  if [[ -n "${candidate}" ]] && ! is_generic_summary_text "${candidate}"; then
    printf '%s' "${candidate}"
    return
  fi

  if [[ -n "${inferred}" ]]; then
    printf '%s' "${inferred}"
    return
  fi

  printf '%s' "${candidate:-${CURRENT_BRANCH}}"
}

join_lines_as_args() {
  tr '\n' ' ' | sed -E 's/[[:space:]]+$//'
}

run_changed_tests_for_summary() {
  local test_files joined test_cmd output
  local fail_lines

  test_files="$(collect_changed_test_files)"
  if [[ -z "${test_files}" ]]; then
    TEST_RESULT_STATUS="not_run"
    TEST_RESULT_COMMAND=""
    TEST_RESULT_SUITES_LINE=""
    TEST_RESULT_TESTS_LINE=""
    TEST_RESULT_FAILED_ITEMS=""
    return
  fi

  joined="$(printf '%s\n' "${test_files}" | join_lines_as_args)"
  TEST_RESULT_COMMAND="npm test -- ${joined}"

  if ! command -v npm >/dev/null 2>&1; then
    TEST_RESULT_STATUS="skipped"
    TEST_RESULT_SUITES_LINE=""
    TEST_RESULT_TESTS_LINE=""
    TEST_RESULT_FAILED_ITEMS="npm コマンドが見つからないため未実行"
    return
  fi

  test_cmd=(npm test --)
  while IFS= read -r test_file; do
    [[ -n "${test_file}" ]] && test_cmd+=("${test_file}")
  done <<< "${test_files}"

  if output="$("${test_cmd[@]}" 2>&1)"; then
    TEST_RESULT_STATUS="passed"
  else
    TEST_RESULT_STATUS="failed"
  fi

  TEST_RESULT_SUITES_LINE="$(printf '%s\n' "${output}" | grep -E '^Test Suites:' | tail -n 1 || true)"
  TEST_RESULT_TESTS_LINE="$(printf '%s\n' "${output}" | grep -E '^Tests:' | tail -n 1 || true)"
  fail_lines="$(printf '%s\n' "${output}" | grep -E '^FAIL ' | head -n 5 || true)"

  if [[ "${TEST_RESULT_STATUS}" == "failed" && -n "${fail_lines}" ]]; then
    TEST_RESULT_FAILED_ITEMS="$(printf '%s' "${fail_lines}" | sed -E 's/^FAIL[[:space:]]+//')"
  else
    TEST_RESULT_FAILED_ITEMS=""
  fi
}

build_pr_change_bullets() {
  local files semantic_summary file_count
  files="$(collect_pr_changed_files)"
  semantic_summary="$(build_primary_change_summary)"

  if [[ -n "${semantic_summary}" ]]; then
    printf '%s\n' "- ${semantic_summary}"
  fi

  if [[ -z "${files}" ]]; then
    printf '%s\n' "- 変更ファイルの取得に失敗しました。必要に応じて追記してください。"
    return
  fi

  file_count="$(printf '%s\n' "${files}" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [[ "${file_count}" -le 1 && -n "${semantic_summary}" ]]; then
    return
  fi

  printf '%s\n' "${files}" | head -n 12 | while IFS= read -r file; do
    printf -- '- `%s`\n' "${file}"
  done
}

build_pr_test_method_bullets() {
  if [[ -n "${TEST_RESULT_COMMAND}" ]]; then
    printf -- '- 自動テスト: `%s`\n' "${TEST_RESULT_COMMAND}"
    return
  fi

  printf '%s\n' "- 自動テスト: 実施なし（変更ファイルに tests/* は含まれていません）"
}

build_browser_test_checklist() {
  local files
  files="$(collect_pr_changed_files)"

  if printf '%s\n' "${files}" | grep -Eq '^(app/api/generate-async/route\.ts|app/api/generation-status/route\.ts|supabase/functions/image-gen-worker/index\.ts|features/generation/)'; then
    cat <<'EOF'
- [ ] ブラウザで生成フォームに有効なプロンプトを入力して送信し、`queued/processing` の後に生成画像が表示されること
- [ ] ブラウザで空のプロンプトを送信し、入力必須のバリデーションエラーメッセージが表示されること
- [ ] 生成失敗ケースを再現し、`画像生成に失敗しました。しばらくしてから、もう一度お試しください。` が表示されること
- [ ] PC（Chrome）/ iOS Safari / Android Chrome で上記導線を操作し、表示崩れがないこと
EOF
    return
  fi

  cat <<'EOF'
- [ ] ブラウザで主要導線を操作し、対象機能が期待どおり完了すること
- [ ] バリデーションエラー条件を操作し、ユーザー向けエラーメッセージが表示されること
- [ ] PC（Chrome）/ iOS Safari / Android Chrome で表示崩れがないこと
EOF
}

build_test_result_bullets() {
  if [[ "${TEST_RESULT_STATUS}" == "passed" ]]; then
    printf '%s\n' "- [x] 実行コマンド: \`${TEST_RESULT_COMMAND}\`"
    if [[ -n "${TEST_RESULT_SUITES_LINE}" ]]; then
      printf '%s\n' "- [x] ${TEST_RESULT_SUITES_LINE}"
    fi
    if [[ -n "${TEST_RESULT_TESTS_LINE}" ]]; then
      printf '%s\n' "- [x] ${TEST_RESULT_TESTS_LINE}"
    fi
    printf '%s\n' "- [x] failed のテスト項目: なし"
    return
  fi

  if [[ "${TEST_RESULT_STATUS}" == "failed" ]]; then
    printf '%s\n' "- [x] 実行コマンド: \`${TEST_RESULT_COMMAND}\`"
    if [[ -n "${TEST_RESULT_SUITES_LINE}" ]]; then
      printf '%s\n' "- [ ] ${TEST_RESULT_SUITES_LINE}"
    fi
    if [[ -n "${TEST_RESULT_TESTS_LINE}" ]]; then
      printf '%s\n' "- [ ] ${TEST_RESULT_TESTS_LINE}"
    fi
    if [[ -n "${TEST_RESULT_FAILED_ITEMS}" ]]; then
      printf '%s\n' "- [ ] failed のテスト項目: ${TEST_RESULT_FAILED_ITEMS}"
    else
      printf '%s\n' "- [ ] failed のテスト項目: あり（詳細はCIログを参照）"
    fi
    return
  fi

  if [[ "${TEST_RESULT_STATUS}" == "skipped" ]]; then
    printf '%s\n' "- [ ] 実行コマンド: ${TEST_RESULT_COMMAND}"
    printf '%s\n' "- [ ] テストは未実行: ${TEST_RESULT_FAILED_ITEMS}"
    printf '%s\n' "- [ ] failed のテスト項目: 判定不可"
    return
  fi

  printf '%s\n' "- [ ] 自動テスト: 実施なし（変更ファイルに tests/* は含まれていません）"
  printf '%s\n' "- [ ] failed のテスト項目: 実施なしのため判定不可"
}

build_pr_body_from_template() {
  local template_file="$1"
  local output_file summary_source summary_text semantic_summary change_bullets test_bullets device_checklist test_result_bullets

  summary_source="${PR_TITLE:-$(git log -1 --pretty=%s 2>/dev/null || true)}"
  summary_text="$(strip_commit_prefix "${summary_source}")"
  semantic_summary="$(build_primary_change_summary)"
  if [[ -n "${semantic_summary}" ]]; then
    if [[ -z "${summary_text}" ]] || is_generic_summary_text "${summary_text}"; then
      summary_text="${semantic_summary}"
    fi
  fi
  summary_text="${summary_text:-${CURRENT_BRANCH}}"
  run_changed_tests_for_summary
  change_bullets="$(build_pr_change_bullets)"
  test_bullets="$(build_pr_test_method_bullets)"
  device_checklist="$(build_browser_test_checklist)"
  test_result_bullets="$(build_test_result_bullets)"

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

### テスト結果
${test_result_bullets}
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
      PR_TITLE="$(default_pr_title)"
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
