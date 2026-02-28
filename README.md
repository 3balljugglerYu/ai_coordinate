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

## スクリプト

- `npm run dev`: 開発サーバー起動
- `npm run build`: 本番ビルド
- `npm run start`: 本番ビルドの起動
- `npm run lint`: ESLint 実行

補助的な検証スクリプトは [`scripts/`](./scripts) にあります。

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

## 関連ドキュメント

- [`docs/free-percoin-expiration-runbook.md`](./docs/free-percoin-expiration-runbook.md)
- [`docs/billing-consistency-runbook.md`](./docs/billing-consistency-runbook.md)
- [`docs/billing-consistency-test-checklist.md`](./docs/billing-consistency-test-checklist.md)
- [`docs/moderation-operations.md`](./docs/moderation-operations.md)
- [`docs/moderation-qa-checklist.md`](./docs/moderation-qa-checklist.md)

## 備考

- このリポジトリには現時点で共有用の `.env.example` はありません。
- 新規参加者向けの導線をさらに改善するなら、次は `.env.example` の追加が有効です。
