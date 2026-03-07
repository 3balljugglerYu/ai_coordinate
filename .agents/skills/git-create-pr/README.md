# git-create-pr スキル

`/git-create-pr` で、`commit -> push -> PR作成` を安全ルール付きで実行するスキルです。

- 保護ブランチ（`main` / `master`）では分岐先の選択を必須化
- コミットメッセージは Conventional Commits で推奨1件を自動判断
- 既定で unstaged を含めて自動で `git add -A`
- PR本文は既存PRテンプレートを優先利用（未検出時のみ `--fill`）
- 認証は `.local/github-auth.env` を優先利用

詳細ルールは [SKILL.md](./SKILL.md) を参照してください。
