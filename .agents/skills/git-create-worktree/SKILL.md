---
name: git-create-worktree
description: Create a new git worktree under <repo>.worktrees/ and auto-run the setup script (symlink .env.local, clone node_modules via APFS clonefile, npm install). Use when user invokes /git-create-worktree or says "ワークツリーを切って", "ワークツリーを作って", "新しいworktreeを用意して", "create a worktree".
---

# Git Create Worktree

## Trigger

- `/git-create-worktree`
- 「ワークツリーを切って」「ワークツリーを作って」「新しい worktree を用意して」
- `create a worktree`

## Workflow

1. ブランチ名を決める。
   - 引数で渡されていればそれを使う。
   - 渡されていなければユーザーに確認する。現在の作業内容から推定できる場合は `<prefix>/<slug>` 形式（`git-create-branch` と同じ命名規則）の候補を1つ提示してから実行する。
2. `bash scripts/worktree-add.sh <branch> [base-branch]` を実行する。
   - base-branch 未指定時は `origin/main` 起点で新規ブランチを切る。
   - 既存ブランチ名を渡した場合は、それをチェックアウトする。
3. スクリプトの出力を確認し、作成された worktree のパス（`<main-root>.worktrees/<branch をハイフン化>`)をユーザーに報告する。
4. 以降の作業を続ける場合は、新しい worktree のパスを作業ディレクトリとして扱う。

## What the script does

`scripts/worktree-add.sh` が以下を自動セットアップする（手動の `npm install` / `.env.local` コピーは不要）:

- worktree を `<main-root>.worktrees/<branch をハイフン化>` に作成
- `.env.local` を main チェックアウトへの **symlink** で配置（常に同期、`.gitignore` 対象なのでコミットされない）
- `node_modules` を **APFS clonefile** でコピー（一瞬・コピーオンライト・各 worktree 独立）。APFS でなければ通常コピーにフォールバック
- `npm install --prefer-offline --no-audit --no-fund` で lockfile との整合を確認

## Safety

- 同名の worktree ディレクトリが既に存在する場合、スクリプトがエラーで停止する（上書きしない）。
- ブランチ名が不明なまま実行しない。
- main/master へ直接コミット・push はしない（worktree 作成のみ）。
