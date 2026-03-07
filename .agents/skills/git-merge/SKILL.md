---
name: git-sync-main
description: Sync local main with origin/main and clean up merged branch safely. Use when user invokes /git-sync-main or says "マージしました".
---

# Git Sync Main

## Trigger

- `/git-sync-main`
- 「マージしました」

## Workflow

次の順で実行します。

1. 現在ブランチ（移動元）を記録
2. `main` に切り替え
3. `git pull --ff-only origin main`
4. `origin/<移動元ブランチ>` が削除済みか確認
5. 削除済みの場合のみ `git branch -d <移動元ブランチ>`

このリポジトリでは `scripts/post-merge-cleanup.sh` を優先利用します。

## Safety

- ワーキングツリーが dirty の場合は停止する
- リモートブランチが未削除ならその時点で終了する
- 強制削除（`git branch -D`）は実行しない
- 現在ブランチが `main` の場合は停止する
