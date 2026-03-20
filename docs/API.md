# Persta.AI API Reference

最終更新: 2026-03-13  
ソース: `app/api/**/*.ts`
閲覧用ビューア: `/api-docs`（`npm run dev` 実行中かつ `API_DOCS_BASIC_AUTH_USER` / `API_DOCS_BASIC_AUTH_PASSWORD` 設定時のみ）

## Overview

Persta.AI の API は、Next.js App Router の Route Handler として実装されています。主な利用者は同一リポジトリ内のフロントエンドであり、一般公開された外部開発者向け API というより、ファーストパーティ用途のアプリケーション API です。

- ベース URL: `http://localhost:3000/api`（開発時）または `${NEXT_PUBLIC_SITE_URL}/api`
- バージョニング: パスベースの API バージョニングは未導入
- 主なバックエンド依存: Supabase, Stripe, Resend
- ルート数: 78

## Access Model

| Access | Description |
| --- | --- |
| `public` | セッション不要。未ログインでも呼び出せる |
| `user session` | Supabase のログインセッションが必要。主にブラウザ Cookie を前提にする |
| `admin session` | `requireAdmin()` による管理者判定が必要。`ADMIN_USER_IDS` 環境変数で許可ユーザーを判定する |
| `webhook` | 外部サービスからの callback を受ける入口。通常のフロントエンドからは呼ばない |
| `bearer secret` | `Authorization: Bearer <secret>` が必要な内部運用 API |

### Authentication Notes

- `user session` と `admin session` は、API トークンではなくアプリのログイン状態を前提としています。
- `requireAuth()` はページ用途ではリダイレクトを行いますが、API Route では `getUser()` を使って `401` を返す実装も混在しています。
- `admin session` は `ADMIN_USER_IDS` に含まれるユーザー ID のみ許可されます。
- `/api/internal/account-purge` は `ACCOUNT_PURGE_CRON_SECRET` または `CRON_SECRET` の Bearer 認証が必要です。
- `/api/stripe/webhook` は `stripe-signature` ヘッダーの検証を実装しています。
- `/api/webhook/nanobanana` は現時点ではプレースホルダーで、Webhook 検証は未実装です。

## API Conventions

### Base URL and Versioning

- 開発環境では `NEXT_PUBLIC_SITE_URL` 未設定時に `http://localhost:3000` が使われます。
- API は基本的に相対パス `/api/...` でフロントエンドから呼び出されます。
- `/api/v1` のような固定バージョンはありません。破壊的変更はフロントエンドと同時に行う前提です。

### Request and Response Format

- リクエスト/レスポンスは JSON が基本です。
- 一部エンドポイントは `multipart/form-data` ではなく Base64 文字列を JSON に載せます。
- 失敗時レスポンスは多くのルートで `{ "error": "..." }` 形式です。
- 成功時レスポンスは統一されておらず、`success`, `message`, `summary`, `posts`, `comment`, `checkoutUrl` などドメイン固有のフィールドを返します。

### Pagination and Query Parameters

- 一覧系では `limit` と `offset` の採用が多いです。
- `limit` は `1..100` に制限される実装が多いです。
- 投稿一覧では `sort` と `q` をサポートします。

### Error Handling

典型的な HTTP ステータスは次の通りです。

- `400`: パラメータ不正、バリデーションエラー
- `401`: 未認証
- `403`: 権限不足
- `404`: 対象リソースなし
- `409`: 重複リクエストや競合
- `429`: Stripe 側のレート制限など
- `500`: サーバー処理失敗
- `503`: 外部サービス接続失敗

### Rate Limiting

共通ミドルウェアによる汎用レート制限は、現時点の Route Handler からは確認できませんでした。代わりに個別ルートで次のような制約があります。

- `/api/admin/bonus/grant-batch`: 1 リクエストあたり最大 300 件
- `/api/posts`: `limit` 最大 100
- `/api/posts/[id]/comments`: `limit` 最大 100
- `/api/generate-async`: 元画像サイズは 10MB まで

## Quick Start

### Public Example: List Posts

```bash
curl "http://localhost:3000/api/posts?limit=20&offset=0&sort=newest"
```

Response:

```json
{
  "posts": [],
  "hasMore": false
}
```

### Session Example: Start Async Generation

通常はログイン済みブラウザから `fetch("/api/generate-async")` で呼びます。外部クライアントで試す場合は、Supabase セッション Cookie を付与してください。

```bash
curl -X POST "http://localhost:3000/api/generate-async" \
  -H "Content-Type: application/json" \
  -H "Cookie: <supabase-session-cookies>" \
  -d '{
    "prompt": "白いジャケットと黒いロングスカートで上品にまとめてください",
    "sourceImageStockId": "11111111-1111-1111-1111-111111111111",
    "sourceImageType": "illustration",
    "backgroundMode": "keep",
    "generationType": "coordinate",
    "model": "gemini-2.5-flash-image"
  }'
```

### Internal Example: Account Purge

```bash
curl -X POST "http://localhost:3000/api/internal/account-purge" \
  -H "Authorization: Bearer <ACCOUNT_PURGE_CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{ "limit": 100 }'
```

## Detailed Endpoint Notes

### `GET /api/posts`

投稿一覧を取得します。

- Access: `public`
- Query:
  - `limit`: 1..100、デフォルト `20`
  - `offset`: 0 以上、デフォルト `0`
  - `sort`: `newest | following | daily | week | month | popular`
  - `q`: 検索文字列
- Response:

```json
{
  "posts": [
    {
      "id": "post-id"
    }
  ],
  "hasMore": true
}
```

- Main errors:
  - `400`: `limit` または `offset` が不正
  - `500`: 投稿取得失敗

### `POST /api/generate-async`

非同期画像生成ジョブを作成し、キューへ投入します。

- Access: `user session`
- Request body:

```json
{
  "prompt": "string, required, max 1000",
  "sourceImageStockId": "uuid, optional",
  "sourceImageBase64": "string, optional",
  "sourceImageMimeType": "image/png | image/jpeg | image/jpg | image/webp | image/gif | image/heic | image/heif",
  "sourceImageType": "illustration | ...",
  "backgroundMode": "enum, optional",
  "count": "1..4, optional",
  "generationType": "coordinate | specified_coordinate | full_body | chibi",
  "model": "gemini-2.5-flash-image | gemini-3-pro-image-1k | gemini-3-pro-image-2k | gemini-3-pro-image-4k"
}
```

補足:

- `sourceImageStockId` か、`sourceImageBase64 + sourceImageMimeType` のどちらかが必須です。
- Base64 元画像は 10MB を超えると `400` になります。
- HEIC/HEIF はサーバー側で JPEG 変換を試みます。

Success response:

```json
{
  "jobId": "job-id",
  "status": "queued"
}
```

Delayed response:

```json
{
  "jobId": "job-id",
  "status": "queued",
  "warning": "ジョブは作成されましたが、処理の開始が遅延する可能性があります。数秒後に再確認してください。"
}
```

Main errors:

- `400`: バリデーション不正、元画像未指定、画像サイズ超過、残高不足
- `401`: 未認証
- `404`: 指定したストック画像が見つからない
- `500`: アップロード失敗、ジョブ作成失敗など
- `202`: ジョブ作成済みだがキュー投入が遅延している可能性あり

### `GET /api/generation-status?id=<jobId>`

画像生成ジョブの進捗を取得します。

- Access: `user session`
- Query:
  - `id`: ジョブ ID 必須

Response:

```json
{
  "id": "job-id",
  "status": "queued",
  "resultImageUrl": null,
  "errorMessage": null
}
```

補足:

- `failed` 時の `errorMessage` は、ユーザー向け文言に正規化される場合があります。
- `id` は自分のジョブのみ取得できます。

Main errors:

- `400`: `id` 未指定
- `401`: 未認証
- `404`: ジョブが見つからない
- `500`: ステータス取得失敗

### `POST /api/credits/checkout`

ペルコイン購入用の Stripe Checkout URL を返します。

- Access: `user session`
- Request body:

```json
{
  "packageId": "required"
}
```

Success response:

```json
{
  "mode": "stripe",
  "checkoutUrl": "https://checkout.stripe.com/...",
  "package": {
    "id": "starter"
  }
}
```

Mock response:

```json
{
  "mode": "mock",
  "checkoutUrl": "http://localhost:3000/my-page?mockPurchase=1&packageId=starter",
  "package": {
    "id": "starter"
  }
}
```

Main errors:

- `400`: `packageId` 不正、Stripe invalid request
- `401`: 未ログイン
- `404`: パッケージ未定義
- `429`: Stripe rate limit
- `503`: Stripe API / connection failure
- `500`: 設定不備や予期しない失敗

### `POST /api/admin/bonus/grant-batch`

管理者がメールアドレス単位でペルコインを一括付与します。

- Access: `admin session`
- Request body:

```json
{
  "grants": [
    { "email": "user@example.com", "amount": 100 }
  ],
  "balance_type": "enum",
  "reason": "キャンペーン付与",
  "send_notification": true
}
```

制約:

- `grants` は 1 件以上 300 件以下
- `amount` は 1 以上の整数
- `reason` は 500 文字以下

Response:

```json
{
  "success": true,
  "results": [
    {
      "email": "user@example.com",
      "status": "success",
      "user_id": "user-id",
      "balance_before": 100,
      "amount_granted": 100,
      "balance_after": 200
    }
  ],
  "summary": {
    "total": 1,
    "success": 1,
    "skipped": 0,
    "error": 0
  },
  "message": "..."
}
```

Main errors:

- `400`: 入力不正
- `401`: 未認証
- `403`: 管理者権限なし
- `500`: ルックアップ失敗、RPC 失敗、残高取得失敗

### `GET|POST /api/internal/account-purge`

削除予定アカウントを物理削除し、関連ストレージと台帳を整理します。

- Access: `bearer secret`
- Auth header:

```text
Authorization: Bearer <ACCOUNT_PURGE_CRON_SECRET>
```

- Input:
  - `GET`: `?limit=100`
  - `POST`: `{ "limit": 100 }`

Response:

```json
{
  "success": true,
  "processed_count": 10,
  "deleted_count": 9,
  "failed_count": 1,
  "avatar_path_parse_failed_count": 0,
  "failures": [
    {
      "user_id": "user-id",
      "reason": "storage remove failed: ..."
    }
  ]
}
```

Main errors:

- `401`: Bearer token 不正
- `500`: secret 未設定、候補取得失敗、削除処理失敗

### `POST /api/internal/generated-images/ensure-webp`

指定した `generated_images.id` に対して WebP variants の生成を非同期でキックします。

- Access: `bearer secret`
- Auth header:

```text
Authorization: Bearer <CRON_SECRET>
```

- Input:

```json
{
  "imageId": "generated-image-id"
}
```

Response:

```json
{
  "accepted": true
}
```

Main errors:

- `400`: `imageId` 未指定
- `401`: Bearer token 不正
- `500`: `CRON_SECRET` 未設定

## Current Implementation Notes

- `/api/admin/generate-webp` は `scope=posted|all` をサポートし、既定値は `posted` です。
- `/api/admin/generate-webp` と `/api/admin/generate-webp-by-id` は `admin session` が必要です。
- `/api/webhook/nanobanana` は受信ログのみで、署名検証や永続化処理は未実装です。
- この API 群は外部公開 SDK 向けに安定化された契約ではありません。外部連携用途に広げる場合は、OpenAPI の導入とレスポンス仕様の統一を先に行うのが安全です。

## Endpoint Inventory

### account

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| DELETE | `/api/account/blocks/[blockedUserId]` | user session | 自分のブロック一覧から対象ユーザーを解除する |
| GET | `/api/account/blocks` | user session | 自分がブロックしているユーザー一覧を取得する |
| POST | `/api/account/deactivate` | user session | 自分のアカウントを停止状態にする |
| POST | `/api/account/reactivate` | user session | 自分のアカウントを再開する |
| DELETE | `/api/account/reports/[postId]` | user session | 自分が送った投稿通報を取り消す |
| GET | `/api/account/reports` | user session | 自分の通報済み投稿一覧を取得する |

### admin

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/api/admin/audit-log` | admin session | 管理操作ログを取得する |
| PATCH | `/api/admin/banners/[id]` | admin session | バナーを更新する |
| DELETE | `/api/admin/banners/[id]` | admin session | バナーを削除する |
| POST | `/api/admin/banners/reorder` | admin session | バナー表示順を一括更新する |
| GET | `/api/admin/banners` | admin session | バナー一覧を取得する |
| POST | `/api/admin/banners` | admin session | バナーを作成する |
| POST | `/api/admin/bonus/bulk-lookup` | admin session | メールアドレス配列から対象ユーザーと残高を一括取得する |
| POST | `/api/admin/bonus/grant` | admin session | 単一ユーザーへペルコインを付与する |
| POST | `/api/admin/bonus/grant-batch` | admin session | 複数ユーザーへペルコインを一括付与する |
| GET | `/api/admin/credits-summary` | admin session | クレジット関連サマリを取得する |
| POST | `/api/admin/deduction` | admin session | 管理者がペルコインを減算する |
| POST | `/api/admin/generate-webp` | admin session | 未生成の WebP 変換バッチを実行する |
| GET | `/api/admin/generate-webp` | admin session | WebP 未生成件数を取得する |
| POST | `/api/admin/generate-webp-by-id` | admin session | 特定画像に対して WebP 生成を実行する |
| PATCH | `/api/admin/materials-images/[slug]/[id]` | admin session | フリー素材画像を更新する |
| DELETE | `/api/admin/materials-images/[slug]/[id]` | admin session | フリー素材画像を削除する |
| POST | `/api/admin/materials-images/[slug]/reorder` | admin session | フリー素材画像の表示順を更新する |
| GET | `/api/admin/materials-images/[slug]` | admin session | フリー素材画像一覧を取得する |
| POST | `/api/admin/materials-images/[slug]` | admin session | フリー素材画像を追加する |
| POST | `/api/admin/moderation/posts/[postId]/decision` | admin session | 投稿モデレーションの判定を確定する |
| GET | `/api/admin/moderation/posts` | admin session | 審査キューを取得する |
| GET | `/api/admin/percoin-defaults` | admin session | デフォルト付与値を取得する |
| PATCH | `/api/admin/percoin-defaults` | admin session | デフォルト付与値を更新する |
| GET | `/api/admin/reports/aggregated` | admin session | 通報集計結果を取得する |
| GET | `/api/admin/reports` | admin session | 通報一覧を取得する |
| GET | `/api/admin/test-auth` | admin session | 管理者判定の動作確認を行う |
| POST | `/api/admin/users/[userId]/reactivate` | admin session | 停止済みユーザーを再開する |
| GET | `/api/admin/users/[userId]` | admin session | 管理対象ユーザー詳細を取得する |
| POST | `/api/admin/users/[userId]/suspend` | admin session | ユーザーを停止する |
| GET | `/api/admin/users` | admin session | 管理画面向けユーザー一覧を取得する |
| GET | `/api/admin/users/search` | admin session | 管理画面向けユーザー検索を行う |

### banners

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/api/banners` | public | ホーム表示用の公開バナー一覧を取得する |

### comments

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| PUT | `/api/comments/[id]` | user session | 自分のコメントを編集する |
| DELETE | `/api/comments/[id]` | user session | 自分のコメントを削除する |

### contact

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/api/contact` | user session | 問い合わせメールを送信する |

### credits

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/api/credits/balance` | user session | 自分のペルコイン残高を取得する |
| POST | `/api/credits/checkout` | user session | Stripe Checkout セッション URL を作成する |
| POST | `/api/credits/consume` | user session | 画像生成等に必要なペルコインを消費する |
| GET | `/api/credits/free-percoin-expiring` | user session | 失効予定の無償ペルコイン情報を取得する |
| POST | `/api/credits/mock-complete` | user session | モック購入完了を反映する |

### generate-async

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/api/generate-async` | user session | 非同期画像生成ジョブを作成する |

### generation-status

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/api/generation-status/in-progress` | user session | 未完了ジョブ一覧を取得する |
| GET | `/api/generation-status` | user session | 指定ジョブの状態を取得する |

### hello

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/api/hello` | public | 疎通確認用の簡易レスポンスを返す |

### internal

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/api/internal/account-purge` | bearer secret | 削除候補のアカウント削除処理を実行する |
| POST | `/api/internal/account-purge` | bearer secret | 削除候補のアカウント削除処理を実行する |
| POST | `/api/internal/generated-images/ensure-webp` | bearer secret | 指定画像の WebP variants 生成を非同期でキックする |

### my-page

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/api/my-page/images` | user session | マイページ用の画像一覧を取得する |

### notifications

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/api/notifications/mark-all-read` | user session | 通知を全件既読にする |
| POST | `/api/notifications/mark-read` | user session | 単一通知を既読にする |
| GET | `/api/notifications` | user session | 通知一覧を取得する |
| GET | `/api/notifications/unread-count` | user session | 未読件数を取得する |

### posts

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/api/posts/[id]/comments` | public | 指定投稿のコメント一覧を取得する |
| POST | `/api/posts/[id]/comments` | user session | 指定投稿へコメントを投稿する |
| POST | `/api/posts/[id]/like` | user session | いいねをトグルする |
| GET | `/api/posts/[id]/like-status` | user session | 自分のいいね状態を取得する |
| DELETE | `/api/posts/[id]` | user session | 自分の投稿を取り消す |
| POST | `/api/posts/[id]/view` | public | 閲覧数を加算する。ログイン中の管理者閲覧はカウントしない |
| POST | `/api/posts/comments/batch` | public | 複数投稿のコメント数を一括取得する |
| POST | `/api/posts/likes/batch` | public | 複数投稿のいいね数を一括取得する |
| POST | `/api/posts/post` | user session | 投稿完了処理とデイリー特典付与を行う |
| GET | `/api/posts` | public | 投稿一覧を取得する |
| PUT | `/api/posts/update` | user session | 投稿キャプションを更新する |

### referral

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/api/referral/check-first-login` | user session | 紹介特典の初回ログイン判定を取得する |
| GET | `/api/referral/generate` | user session | 自分の紹介コードを生成または取得する |

### reports

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/api/reports/posts` | user session | 投稿を通報し、審査待ち判定メトリクスを更新する |

### revalidate

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/api/revalidate/coordinate` | user session | コーディネート画面のキャッシュを無効化する |
| POST | `/api/revalidate/home` | user session | ホーム画面のキャッシュを無効化する |

### source-image-stocks

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| DELETE | `/api/source-image-stocks/[id]` | user session | 自分のストック画像を削除する |
| POST | `/api/source-image-stocks` | user session | ストック画像をアップロードする |

### streak

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| GET | `/api/streak/check` | user session | ストリーク状態を取得する |
| POST | `/api/streak/check` | user session | ストリーク特典を付与する |

### stripe

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/api/stripe/webhook` | webhook | Stripe の `checkout.session.completed` を処理する |

### tutorial

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/api/tutorial/complete` | user session | チュートリアル完了特典を付与する |

### users

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/api/users/[userId]/avatar` | user session | 自分のプロフィール画像をアップロードする |
| POST | `/api/users/[userId]/block` | user session | 指定ユーザーをブロックする |
| DELETE | `/api/users/[userId]/block` | user session | 指定ユーザーのブロックを解除する |
| GET | `/api/users/[userId]/block-status` | user session | 指定ユーザーのブロック状態を確認する |
| POST | `/api/users/[userId]/follow` | user session | 指定ユーザーをフォローする |
| DELETE | `/api/users/[userId]/follow` | user session | 指定ユーザーのフォローを解除する |
| GET | `/api/users/[userId]/follow-status` | user session | 指定ユーザーのフォロー状態を確認する |
| GET | `/api/users/[userId]/posts` | public | 指定ユーザーの投稿一覧を取得する |
| GET | `/api/users/[userId]/profile` | public | 指定ユーザーのプロフィールを取得する |
| PATCH | `/api/users/[userId]/profile` | user session | 自分のプロフィールを更新する |

### webhook

| Method | Path | Access | Summary |
| --- | --- | --- | --- |
| POST | `/api/webhook/nanobanana` | webhook | Nano Banana からの生成完了通知受け口。現状はプレースホルダー |
