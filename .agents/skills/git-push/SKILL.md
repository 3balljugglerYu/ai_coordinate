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
- Conventional Commits で 2-3 候補を提示
- 次の文面で選択を促す:

```text
コミットメッセージは下記のどれにしますか？
1. <option A>（推奨）
2. <option B>
3. <option C>
```

4. 実行
- 既定 add 範囲: staged only
- 全変更を含める明示指示時のみ `--add-all`
- `scripts/git-commit-and-push.sh` を優先利用

## Safety

- `main` / `master` へ直接 push しない
- ステージ対象がない場合は停止してユーザーに通知する
