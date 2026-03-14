# プロジェクト規約

英語版: [`project-conventions.md`](./project-conventions.md)

- 最終更新日: `2026-03-14`
- 想定読者: このリポジトリで作業する開発者
- 役割: リポジトリ構成、技術スタック、実装方針に関する人間向け正本

## このドキュメントの役割

`.cursor/rules/project-rule.mdc` は Cursor が常時読む adapter です。  
このドキュメントは、開発者や他の agent が確認するための正本です。

推奨の読み順:

1. このファイルでリポジトリ全体の開発規約を確認する
2. `docs/architecture/data.ja.md` でデータ構造と Supabase 構成を確認する
3. `docs/product/requirements.md` でプロダクト要件を確認する
4. `docs/planning/implementation-roadmap.md` で実装状況を確認する
5. `docs/API.md` で route 単位の契約を確認する

## 技術スタック

### フロントエンド

- Next.js `16.0.7` with App Router
- React `19.2.0`
- TypeScript `^5` with `strict` mode
- Tailwind CSS `^4.1.16`
- shadcn/ui

### バックエンドとデータ

- API と PostgreSQL に Supabase を使用
- 認証に Supabase Auth を使用
- 生成画像などの保存に Supabase Storage を使用

### デプロイ

- Vercel
- 本番シークレットと runtime 設定は環境変数で管理する

## リポジトリ構成

### App Router 構成

- `app/(marketing)/`: 公開ページ
- `app/(app)/`: 認証後エリア
- `app/(app)/admin/`: 管理画面
- `app/api/`: Route Handlers
- `app/layout.tsx`: ルートレイアウト
- `app/loading.tsx`: グローバル loading UI

### Feature ベース構成

- `features/[feature-name]/`
- `features/[feature-name]/components/`: feature 専用コンポーネント
- `features/[feature-name]/actions/`: 必要に応じた Server Actions
- `features/[feature-name]/lib/`: feature 専用 utility、schema、server helper
- `features/[feature-name]/types.ts`: feature 専用型定義

### 共有リソース

- `components/ui/`: shadcn/ui ベースの共有 UI コンポーネント
- `components/`: 汎用共有コンポーネント
- `lib/`: 共有 utility とプラットフォーム helper
- `hooks/`: 汎用 hook
- `types/`: 横断的に使う共有型
- `constants/`: アプリ全体で使う定数

重要な共有ファイル:

- `lib/supabase/client.ts`: ブラウザ用 Supabase client
- `lib/supabase/server.ts`: セッションスコープの server Supabase client
- `lib/env.ts`: 型付き環境変数 access
- `lib/auth.ts`: 認証 helper

### Supabase 構成

- `supabase/migrations/`: SQL migration と source of truth
- `supabase/functions/`: Edge Functions
- `supabase/policies/`: 必要に応じて分割された RLS policy

## 一般的な開発ルール

### パスエイリアス

- `@/*` は project root を指す
- 例: `import { cn } from '@/lib/utils'`

### 環境変数

- シークレットは commit しない
- ローカル開発では `.env.local` を使う
- 環境変数は `lib/env.ts` 経由で読む
- Vercel の環境変数と runtime の期待値を揃える

### コーディング規約

- client component が必須でない限り React Server Components を優先する
- feature 固有のコードは `features/` に置く
- 横断的に再利用するコードは `lib/` または `components/` に置く
- データアクセス方法は明示する
  - セッションスコープ access は `createClient()`
  - 特権 access は `createAdminClient()`
  - 複数テーブルにまたがる業務処理は SQL RPC または trigger

### Rendering と performance

- 適切な箇所では Next.js 16 の Partial Prerendering パターンを使う
- 静的コンテンツは先に render し、動的コンテンツは `Suspense` の後ろで stream する
- クライアントに送る JavaScript を減らせるなら route 単位または component 単位の code splitting を使う

### Styling

- Tailwind CSS v4 utility classes を使う
- 必要に応じて `globals.css` の `@theme inline` で theme token を定義する
- 既存 UI 言語に合うなら shadcn/ui を使う
- class 名の結合には `lib/utils.ts` の `cn()` を使う
- アイコンは Lucide React を使う

## Mobile-first ルール

このプロダクトは主にスマートフォンで使われます。実装は mobile-first を前提にします。

### Layout と responsiveness

- まず mobile 幅で設計し、その後 `sm:`, `md:`, `lg:`, `xl:` へ広げる
- `max-w-*` や container 制約でコンテンツ幅を制御する

### タッチターゲット

- 操作要素は最低でも `44x44px`、理想は `48x48px`
- ボタンやリンクには十分な padding を持たせる
- hover は desktop 向けの追加挙動として扱い、依存しない

### Mobile UX

- スクロール領域の周辺に十分な余白を確保する
- フォーム入力には `text-base` 以上を優先する
- mobile keyboard の重なりや fixed 配置に注意する
- sticky / fixed UI では notch や home indicator の safe area を考慮する

### Mobile performance

- 適切な場合は `next/image` を使う
- bundle size と client-side JavaScript を抑える
- slow mobile networks を想定して fetch と loading を設計する
- 必要に応じて skeleton と progressive loading を使う

### テスト方針

- 開発中は browser DevTools で mobile layout を確認する
- touch、viewport、Safari に敏感な変更は実機確認を優先する

## セキュリティと安全性

- API key や DB credential をハードコードしない
- `.env.local` を git に入れない
- 明確に共有コードでない限り、新しい feature コードは `features/` 配下に置く

## 関連ドキュメント

- `docs/architecture/data.ja.md`
- `docs/product/requirements.md`
- `docs/product/user-stories.md`
- `docs/planning/implementation-roadmap.md`
- `docs/business/monetization.md`
- `docs/API.md`
