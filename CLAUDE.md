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

## Supabase 操作の許可範囲

エージェントは、調査・実装・デプロイを目的として、以下の Supabase 操作を行って良い。

### 許可される操作
- **マイグレーション適用**：`supabase migration up`、`supabase db push`
- **Edge Functions デプロイ**：`supabase functions deploy <function-name>`
- **DBクエリ実行（参照系）**：`supabase db remote query "..."`、`psql` での読み取り
- **バケット操作**：必要に応じて `supabase storage` コマンド

### 許可される認証情報の取得元
以下のいずれかから認証情報を取得して使って良い：
- 環境変数：`SUPABASE_DB_PASSWORD`、`SUPABASE_ACCESS_TOKEN`、`SUPABASE_PROJECT_REF`
- `.env.local` の Supabase 関連キーのみ：`SUPABASE_DB_PASSWORD`、`SUPABASE_ACCESS_TOKEN`、`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`（必要時のみ）
- `supabase` CLI が既にログイン済みの場合のセッション

### 引き続き禁止される操作
- `.env` 内のSupabase以外の秘密情報（Stripe、OpenAI、Gemini、Resend 等）を読み取ること
- 認証情報をチャット出力やコミットメッセージ、ファイルに含めること
- 本番DBへの**破壊的操作**（DROP, TRUNCATE, DELETE without WHERE 等）はユーザー承認なしに実行しないこと
- マイグレーションの **rollback / down** をユーザー承認なしに実行しないこと
- Edge Function の **削除** をユーザー承認なしに実行しないこと

### 推奨される運用フロー
1. マイグレーション適用前：差分を `supabase db diff` で確認、ユーザーに見せる
2. デプロイ前：影響範囲（既存呼び出し、依存関数）をチェック
3. 本番適用前：可能な限りステージング/ローカルで先に検証
4. 適用後：影響を確認するクエリを実行して結果を報告
