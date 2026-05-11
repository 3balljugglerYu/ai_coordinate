#!/usr/bin/env bash

# 新しい git worktree を作り、開発に必要な未追跡ファイルを自動でセットアップする。
#
# やること:
#   1. ../<repo>.worktrees/<branch> に worktree を作成
#      （既存ブランチならそれを、無ければ base から新規ブランチを切る）
#   2. .env.local を main チェックアウトへの symlink で配置（常に同期）
#   3. node_modules を APFS clonefile でコピー（一瞬・コピーオンライト・各worktree独立）
#   4. 念のため `npm install` で lockfile との整合をチェック
#
# 使い方:
#   bash scripts/worktree-add.sh <branch> [base-branch]
#
# 例:
#   bash scripts/worktree-add.sh feature/foo            # origin/main から新規ブランチ
#   bash scripts/worktree-add.sh feature/foo main       # main から新規ブランチ
#   bash scripts/worktree-add.sh existing-branch        # 既存ブランチをチェックアウト

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/worktree-add.sh <branch> [base-branch]

Arguments:
  <branch>        作成/チェックアウトするブランチ名
  [base-branch]   新規ブランチを切る場合の基点（既定: origin/main）

セットアップ内容:
  - .env.local           → main チェックアウトへの symlink
  - node_modules         → APFS clonefile コピー（高速・独立）
  - npm install          → lockfile との整合チェック
EOF
}

case "${1:-}" in
  -h | --help | "")
    usage
    [[ -z "${1:-}" ]] && exit 1 || exit 0
    ;;
esac

BRANCH="$1"
BASE="${2:-origin/main}"

# このスクリプトはどの worktree から実行しても良い。
# git-common-dir の親が main チェックアウト。
GIT_COMMON_DIR="$(git rev-parse --git-common-dir)"
GIT_COMMON_DIR="$(cd "${GIT_COMMON_DIR}" && pwd)"
MAIN_ROOT="$(dirname "${GIT_COMMON_DIR}")"

# worktree 配置先: <main-root>.worktrees/<branch をスラッシュ→ハイフン化>
WT_PARENT="${MAIN_ROOT}.worktrees"
WT_NAME="${BRANCH//\//-}"
WT_DIR="${WT_PARENT}/${WT_NAME}"

if [[ -e "${WT_DIR}" ]]; then
  echo "❌ 既に存在します: ${WT_DIR}" >&2
  exit 1
fi

mkdir -p "${WT_PARENT}"

# --- worktree 作成 ---------------------------------------------------------
if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  echo "▶ 既存ブランチ '${BRANCH}' を ${WT_DIR} にチェックアウト"
  git worktree add "${WT_DIR}" "${BRANCH}"
else
  echo "▶ '${BASE}' を基点に新規ブランチ '${BRANCH}' を ${WT_DIR} に作成"
  git fetch origin --quiet || echo "  (git fetch に失敗: オフラインのまま続行)"
  git worktree add -b "${BRANCH}" "${WT_DIR}" "${BASE}"
fi

# --- .env.local を symlink -------------------------------------------------
if [[ -f "${MAIN_ROOT}/.env.local" ]]; then
  ln -sf "${MAIN_ROOT}/.env.local" "${WT_DIR}/.env.local"
  echo "✔ .env.local → ${MAIN_ROOT}/.env.local (symlink)"
else
  echo "⚠ ${MAIN_ROOT}/.env.local が見つかりません。手動で用意してください。"
fi

# 他にも worktree ごとに必要な未追跡ファイルがあればここに追記する:
#   ln -sf "${MAIN_ROOT}/.claude/settings.local.json" "${WT_DIR}/.claude/settings.local.json"

# --- node_modules を clonefile コピー --------------------------------------
if [[ -d "${MAIN_ROOT}/node_modules" ]]; then
  echo "▶ node_modules をコピー中..."
  # macOS APFS: `cp -c` は clonefile(2) を使い一瞬で完了。COW なので main を壊さない。
  # APFS でない / GNU coreutils 環境では通常コピーにフォールバック。
  if ! cp -cR "${MAIN_ROOT}/node_modules" "${WT_DIR}/node_modules" 2>/dev/null; then
    echo "  (clonefile が使えないため通常コピー)"
    cp -R "${MAIN_ROOT}/node_modules" "${WT_DIR}/node_modules"
  fi
  echo "✔ node_modules をコピーしました"
fi

# --- lockfile との整合チェック --------------------------------------------
echo "▶ npm install で lockfile との整合を確認..."
( cd "${WT_DIR}" && npm install --prefer-offline --no-audit --no-fund )

echo ""
echo "✅ worktree 準備完了: ${WT_DIR}"
echo "   cd ${WT_DIR}"
