# git-create-worktree スキル

`/git-create-worktree`（または「ワークツリーを切って」）で、新しい git worktree を作成し、
開発に必要な未追跡ファイルを自動セットアップするスキルです。

- worktree を `<repo>.worktrees/<branch>` に作成
- `.env.local` を main チェックアウトへの symlink で配置
- `node_modules` を APFS clonefile で高速コピー（`npm install` の待ち時間なし）
- `npm install` で lockfile との整合を確認

実体は [`scripts/worktree-add.sh`](../../../scripts/worktree-add.sh)、詳細ルールは [SKILL.md](./SKILL.md) を参照してください。
