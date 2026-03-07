# git-merge スキル

`/git-sync-main` で、マージ後の安全な後処理を行うスキルです。

- `main` へ移動して `origin/main` を fast-forward pull
- リモート元ブランチが削除済みのときだけローカルブランチ削除
- リモート未削除なら停止

詳細ルールは [SKILL.md](./SKILL.md) を参照してください。
