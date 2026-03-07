# Persta.AI

Persta.AI は、AI でファッションやキャラクターのビジュアル表現をスタイリングできる Web アプリです。ユーザーは画像生成、投稿・閲覧、プロフィール管理、クレジット購入をブラウザ上で行えます。

## 主な機能

- AI コーディネート生成
- 生成画像の投稿・閲覧
- マイページ、プロフィール編集、通知
- ペルコイン残高確認と購入
- 管理画面
  - ユーザー管理
  - モデレーション
  - バナー管理
  - 付与 / 減算 / 監査ログ

## 技術スタック

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase
- Stripe
- Resend
- Google Analytics 4

## セットアップ

### 1. 依存関係をインストール

```bash
npm install
```

### 2. 環境変数を設定

`.env.local` を作成し、必要な値を設定してください。既に `.env.local` がある場合はそのまま編集してください。

```bash
touch .env.local
```

最低限、以下が未設定だと主要機能は動作しません。

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000

NEXT_PUBLIC_GOOGLE_AI_STUDIO_API_KEY=
GEMINI_API_KEY=

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
```

### 3. 開発サーバーを起動

```bash
npm run dev
```

起動後、`http://localhost:3000` を開いて確認します。

### 4. テスト実行（Jest / Playwright）

このリポジトリは、以下のテストコマンドを実行できる状態です。

```bash
# Unit / Integration（Jest）
npm run test

# E2E（Playwright）
npm run test:e2e
```

Playwright を初めて使う環境では、先にブラウザをインストールしてください。

```bash
npx playwright install
```

## スクリプト

- `npm run dev`: 開発サーバー起動
- `npm run build`: 本番ビルド
- `npm run start`: 本番ビルドの起動
- `npm run lint`: ESLint 実行
- `npm run test`: Jest（Unit / Integration）実行
- `npm run test:watch`: Jest watch 実行
- `npm run test:coverage`: Jest カバレッジ付き実行
- `npm run test:e2e`: Playwright E2E 実行
- `npm run test:e2e:ui`: Playwright UI モード実行

補助的な検証スクリプトは [`scripts/`](./scripts) にあります。

## Testing Flow（テスト進行管理）

テスト実装の進行管理は、`testing-flow` スキルと関連コマンドで行います。

### 主なコマンド

- `/test-flow`: 次の推奨対象を判定
- `/test-flow <Target>`: 指定ターゲットの現状確認と次アクション提案
- `/test-flow --status`: 全体進捗サマリ表示
- `/test-checklist`: Tier別の進捗一覧表示
- `/test-checklist start <Target>`: 対象を着手状態に更新
- `/test-checklist complete <Target>`: 対象を完了状態に更新

### 運用フロー

1. `/test-checklist` で対象を選定
2. `/test-flow <Target>` で依存・spec・テスト有無を確認
3. 必要に応じて `/char-test` または `/interface-create` を実施
4. `/spec-extract` -> `/spec-write` -> `/test-generate` を実施
5. `/test-reviewing` -> `/test-fixing` を繰り返す
6. `/spec-verify` 後に `/test-checklist complete <Target>` で完了

### 関連ファイル

- [`docs/TEST_PLAN.md`](./docs/TEST_PLAN.md): テスト計画と優先度定義
- [`docs/test-progress.yaml`](./docs/test-progress.yaml): 進捗トラッカー
- [`docs/specs/`](./docs/specs): EARS仕様ファイル
- [`.agents/skills/testing-flow/SKILL.md`](./.agents/skills/testing-flow/SKILL.md): スキル本体
- [`.agents/skills/test-checklisting/SKILL.md`](./.agents/skills/test-checklisting/SKILL.md): 進捗管理スキル

## Git運用コマンド

このリポジトリでは、Codex への明示コマンドとして以下を使用します。

- `repo:push`: `add -> commit -> push` を実行
- `repo:create-pr`: `commit -> push -> PR作成` を実行
- `repo:merge`: マージ後の後処理を実行

`repo:merge` の実行内容:

1. 実行時点のブランチ（移動元）を記録
2. `main` に移動
3. `git pull --ff-only origin main` で最新化
4. `origin/<移動元ブランチ>` が削除済みか確認
5. 削除済みならローカルブランチを `git branch -d` で削除

安全ルール:

- `main` / `master` への直接 push は行わない
- `repo:merge` では、リモートブランチが未削除ならその時点で終了する
- 強制削除（`git branch -D`）は行わない

## 環境変数

### コア

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `ADMIN_USER_IDS`

### AI 生成

- `NEXT_PUBLIC_GOOGLE_AI_STUDIO_API_KEY`
- `NEXT_PUBLIC_NANOBANANA_API_KEY`
- `GEMINI_API_KEY`

### 決済

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICING_TABLE_ID`
- `NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID`

### 分析

- `NEXT_PUBLIC_GA4_MEASUREMENT_ID`
- `GA4_PROPERTY_ID`
- `GA4_SERVICE_ACCOUNT_JSON_BASE64`
- `GA4_BIGQUERY_PROJECT_ID`
- `GA4_BIGQUERY_DATASET`

### 運用 / バッチ

- `ACCOUNT_PURGE_CRON_SECRET`
- `ACCOUNT_FORFEITURE_HASH_SALT`
- `CRON_SECRET`
- `NEXT_PUBLIC_EVENT_USER_ID`

### メール

- `RESEND_API_KEY`
- `CONTACT_EMAIL`
- `RESEND_FROM_EMAIL`

実際の参照箇所は [`lib/env.ts`](./lib/env.ts) を確認してください。

## ディレクトリ構成

- [`app/`](./app): App Router のページ、API Route、レイアウト
- [`features/`](./features): 機能単位の UI / ロジック
- [`components/`](./components): 共通コンポーネント
- [`lib/`](./lib): 共通ユーティリティ、認証、環境変数
- [`supabase/`](./supabase): マイグレーション、Edge Function 設定
- [`docs/`](./docs): 運用手順、runbook、実装メモ
- [`scripts/`](./scripts): 手動検証スクリプト

## Supabase / マイグレーション

- SQL マイグレーションは [`supabase/migrations/`](./supabase/migrations) にあります。
- Edge Function は [`supabase/functions/image-gen-worker/`](./supabase/functions/image-gen-worker) にあります。
- 手動反映が必要なケースでは [`docs/manual-migration-steps.md`](./docs/manual-migration-steps.md) を参照してください。

## 備考

- このリポジトリには現時点で共有用の `.env.example` はありません。
- 新規参加者向けの導線をさらに改善するなら、次は `.env.example` の追加が有効です。
