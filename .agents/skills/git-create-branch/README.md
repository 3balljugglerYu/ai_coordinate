# git-create-branch スキル

`/git-create-branch` で、`main` 上のローカル変更から適切なブランチ名を自動生成し、作成・切替するスキルです。

- 現在ブランチが `main` 以外なら何もせず終了
- `main` のときのみ変更内容から branch 名を推定
- 同名ブランチがある場合は重複を回避して作成

詳細ルールは [SKILL.md](./SKILL.md) を参照してください。
