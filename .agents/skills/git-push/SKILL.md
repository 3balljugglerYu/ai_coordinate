---
name: git-push
description: Execute add -> commit -> push safely without creating a PR. Use when user invokes /git-push or asks "プッシュして", "pushして".
---

# Git Push

## Trigger

- `/git-push`
- 「プッシュして」
- `pushして`

## Workflow

1. コンテキスト確認
- `git status --short --branch`
- 現在ブランチ

2. `main` / `master` 安全ルール
- 保護ブランチ上では継続しない
- 推奨案先頭の3候補を提示し、ユーザー選択後にブランチ作成/切替

3. コミット作成
- 差分を要約
- 差分に基づいて Conventional Commits 形式の推奨コミットメッセージを1件自動決定
- 候補の複数提示は行わず、そのまま commit -> push まで進める

4. 実行
- 既定 add 範囲: unstaged を含めて自動で `git add -A`
- staged 済みのみで実行したい場合だけ `--staged-only` を使う
- `scripts/git-commit-and-push.sh` を優先利用

## Safety

- `main` / `master` へ直接 push しない
- ステージ対象がない場合は停止してユーザーに通知する
