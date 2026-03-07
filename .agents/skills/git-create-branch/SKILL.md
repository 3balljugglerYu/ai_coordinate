---
name: git-create-branch
description: Create and switch to an appropriate branch from main based on local implementation changes. Use when user invokes /git-create-branch.
---

# Git Create Branch

## Trigger

- `/git-create-branch`

## Workflow

1. 現在ブランチを確認する。
2. 現在ブランチが `main` 以外なら終了する（何も変更しない）。
3. 現在ブランチが `main` なら、`git status --porcelain` の変更内容を確認する。
4. 変更ファイルから prefix/slug を推定し、適切なブランチ名を生成する。
5. `git switch -c <generated-branch>` で作成して切り替える。

このリポジトリでは `scripts/git-create-branch.sh` を優先利用する。

## Naming Rules

- 形式: `<prefix>/<slug>`
- prefix の判定:
  - docs/markdown 中心: `docs`
  - test 中心: `test`
  - スクリプト/設定中心: `chore`
  - それ以外: `feature`
- 同名ブランチが既に存在する場合は日付サフィックスを付けて衝突回避する。

## Safety

- `main` 以外では branch 作成を実行しない。
- 既存ブランチを強制上書きしない。
