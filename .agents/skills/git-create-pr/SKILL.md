---
name: git-create-pr
description: Execute commit -> push -> PR creation safely in this repository. Use when user invokes /git-create-pr or asks "PRを作成して", "PR作って", "create pr", "open a pull request".
---

# Git Create PR

## Trigger

- `/git-create-pr`
- 「PRを作成して」
- 「PR作って」
- `create pr`
- `open a pull request`

既定は実行モードです。文面作成のみを明示された場合だけドラフトモードにします。

## Workflow

1. コンテキスト確認
- `git status --short --branch`
- 現在ブランチ
- `origin` リポジトリが `3balljugglerYu/ai_coordinate` か確認

2. 認証確認
- 優先: `.local/github-auth.env`
- 必須キー: `GITHUB_USERNAME`, `GH_TOKEN`
- トークン値は表示しない

3. `main` / `master` 安全ルール
- 保護ブランチ上では継続しない
- 推奨案先頭の3候補を提示し、ユーザー選択後にブランチ作成/切替

4. コミット作成
- 差分を要約
- 差分に基づいて Conventional Commits 形式の推奨コミットメッセージを1件自動決定
- 候補の複数提示は行わず、そのまま commit -> push -> PR作成まで進める

5. 実行
- 既定 add 範囲: unstaged を含めて自動で `git add -A`
- staged 済みのみで実行したい場合だけ `--staged-only` を使う
- `scripts/git-commit-push-pr.sh` を優先利用

6. PR作成
- 同一 head の open PR があれば URL を返して再作成しない
- PR本文指定がない場合は、リポジトリ内の既存 PR テンプレートを優先して利用する
- テンプレートが見つからない場合のみ `gh pr create --fill` にフォールバックする
- 未作成なら PR を作成し URL を返す

## Safety

- `main` / `master` へ直接 push しない
- 認証情報は追跡ファイルに書かない
- リポジトリ不一致時は停止する
