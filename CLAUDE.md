# CLAUDE.md

このリポジトリでは、エージェント向けの正典を以下のファイルに集約しています。
Claude Code は作業前に必ず以下を順番に参照してください。

## 必読(この順で読む)

1. **`AGENTS.md`** — エージェント向けの行動規範・運用ルールの正典
2. **`docs/development/project-conventions.md`** — プロジェクト規約
3. **`docs/architecture/`** — アーキテクチャドキュメント

## 補助資料

- **`.cursor/rules/`** — Cursor 向けルール(Claude Code も内容を参照してよい)
- **`.agents/skills/`** — エージェント向けスキル定義
  - 特に `.agents/skills/codex-webpack-build/` はビルド時に必読

## 検証コマンド

変更後は以下をすべて実行し、すべてパスすること:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build -- --webpack`

### ビルドに関する重要な注意

サンドボックス環境(GitHub Actions / Claude Code の Bash 実行環境含む)では、
**必ず `--webpack` オプションを付けてビルドすること**。
Turbopack ビルドはサンドボックス環境で stall することがある。
詳細は `.agents/skills/codex-webpack-build/` を参照。

## 特に重要な規約リマインダー

- **PR のタイトル・本文は日本語必須**(Conventional Commit プレフィックスのみ英語可)
  詳細は AGENTS.md を参照

## 依存関係・ツールに関する注意

- Prettier は導入していない(ESLint v9 で十分と判断)。Prettier を自発的に導入することは禁止
- ESLint v9 (flat config) を直接使用。`next lint` への変更は禁止
- `package.json` の scripts を勝手に変更することは禁止

## Claude Code 固有の運用ルール

- `AGENTS.md` と本ファイルが矛盾した場合、`AGENTS.md` を優先
- .env や秘密情報に触れない
- main/master へ直接 push しない
- 範囲外のリファクタリング・依存更新を行わない

## 判断に迷ったら

このファイルや AGENTS.md、参照先ドキュメントに書かれていない判断が必要な場合、
自己判断で進めず必ずユーザーに質問してください。
