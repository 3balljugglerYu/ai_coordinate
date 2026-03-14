# 画面遷移

英語版: [`screen-flow.en.md`](./screen-flow.en.md)

- Last updated: `2026-03-14`
- Audience: 開発者、プロダクトオーナー、デザイナー
- Role: 現行アプリの正本となる画面遷移ドキュメント

## このドキュメントの役割

このドキュメントは、現在の主要なユーザー向け画面遷移と管理画面導線を整理したものです。  
単なる route 一覧ではなく、「ユーザーがどの画面からどこへ進むか」を把握することを目的にしています。

推奨の読み順:

1. このファイルで画面遷移を掴む
2. `docs/product/requirements.md` で機能要件を確認する
3. `docs/architecture/data.md` で実装とデータフローを確認する
4. `docs/planning/implementation-roadmap.md` で進捗と優先度を確認する

## 主要ナビゲーション

現在のアプリシェルに出ている主要ナビゲーション:

- `/`: ホーム
- `/coordinate`: コーディネート
- `/challenge`: ミッション
- `/notifications`: お知らせ
- `/my-page`: マイページ

未認証ユーザーはホームのみ直接利用できます。  
コーディネート、ミッション、お知らせ、マイページを押すと `/login?redirect=/` に遷移します。

## 主なユーザーフロー

```text
ホーム (/)
  ├─ 投稿タップ -> 投稿詳細 (/posts/[id])
  │    ├─ 投稿者タップ -> ユーザープロフィール (/users/[userId])
  │    └─ いいね / コメント / フォロー -> 認証必須
  │
  ├─ コーディネートタップ -> 未認証なら Login / Signup
  │    └─ コーディネート (/coordinate)
  │         ├─ 対象ユーザーにはチュートリアル
  │         ├─ 画像生成
  │         ├─ プレビュー / 拡大表示
  │         └─ 投稿 -> 投稿モーダル -> ホームまたは投稿詳細
  │
  ├─ ミッションタップ -> 未認証なら Login
  │    └─ ミッション (/challenge)
  │         ├─ チュートリアル状態
  │         ├─ 連続ログイン / 紹介 / ボーナス情報
  │         └─ ボーナス関連導線
  │
  ├─ お知らせタップ -> 未認証なら Login
  │    └─ お知らせ (/notifications)
  │         ├─ フォロー通知タップ -> /users/[userId]?from=notifications
  │         └─ 投稿通知タップ -> /posts/[id]?from=notifications
  │
  └─ マイページタップ -> 未認証なら Login
       └─ マイページ (/my-page)
            ├─ ペルコインカード -> /my-page/credits
            │    └─ 購入導線 -> /my-page/credits/purchase
            ├─ 画像タップ -> /posts/[id]?from=my-page
            ├─ 所有者専用画像詳細 -> /my-page/[id]
            ├─ アカウント -> /my-page/account
            └─ お問い合わせ -> /my-page/contact
```

## 画面グループ

### 1. ホームと閲覧導線

- `/`: ホーム投稿一覧
- `/posts/[id]`: 投稿詳細
- `/users/[userId]`: 公開ユーザープロフィール
- `/search`: 検索
- `/free-materials`: フリー素材

ポイント:

- ホームが既定のランディングページです。
- 投稿詳細は公開閲覧できます。
- いいね、フォロー、コメントは認証必須です。
- 戻る先は sticky header が `from` クエリで切り替えます。

### 2. 生成導線

- `/coordinate`: 画像生成
- 生成結果プレビュー
- 生成結果からの投稿モーダル

ポイント:

- コーディネート画面は認証必須です。
- 対象ユーザーにはチュートリアル導線があります。
- 生成結果 UI からそのまま投稿できます。

### 3. ミッション、お知らせ、グロース導線

- `/challenge`: ミッション
- `/notifications`: お知らせ一覧

ポイント:

- どちらも認証必須です。
- お知らせからは `from=notifications` を付けて投稿詳細やプロフィールへ遷移します。
- ミッション画面はチュートリアル、連続ログイン、紹介などの特典導線の理解に使われます。

### 4. マイページとアカウント管理

- `/my-page`: プロフィール概要と生成画像一覧
- `/my-page/[id]`: 所有者専用画像詳細
- `/my-page/credits`: 残高と履歴
- `/my-page/credits/purchase`: ペルコイン購入
- `/my-page/account`: アカウント管理、ブロック、通報履歴、退会申請
- `/my-page/contact`: お問い合わせ
- `/account/reactivate`: 退会予約後の復帰導線

ポイント:

- `/my-page/[id]` は現行実装に存在し、将来予定ではありません。
- マイページからは `/posts/[id]?from=my-page` の共有投稿詳細にも遷移します。
- 購入成功 / キャンセルのメッセージは `/my-page/credits/purchase` 側で扱います。

### 5. 認証と復旧導線

- `/login`
- `/signup`
- `/auth/callback`
- `/auth/x-complete`
- `/reset-password`
- `/reset-password/confirm`

ポイント:

- ログイン画面は query param で遷移先を受け取ります。
- OAuth 完了時は最終遷移前に `/auth/x-complete` を経由することがあります。
- お問い合わせや一部アカウント導線は、専用の `redirect` 付きで login に戻します。

### 6. 管理画面

主要な管理 route:

- `/admin`
- `/admin/users`
- `/admin/users/[userId]`
- `/admin/moderation`
- `/admin/reports`
- `/admin/percoin-defaults`
- `/admin/bonus`
- `/admin/bonus/bulk`
- `/admin/deduction`
- `/admin/credits-summary`
- `/admin/banners`
- `/admin/materials-images/free-materials`
- `/admin/image-optimization`
- `/admin/audit-log`

ポイント:

- 管理画面は admin layout で保護され、非管理者は `/` へ戻されます。
- 管理導線は旧 `screen-flow` よりかなり広がっており、現行の route 群を優先して扱うべきです。

## 戻る導線のルール

現在の sticky header は戻り先を次のように解決します。

- `from=my-page` -> `/my-page`
- `from=notifications` -> `/notifications`
- `from=coordinate` -> `/coordinate`
- `from` が無い `/my-page/*` 配下 -> `/my-page`
- それ以外 -> `/`

同じ投稿詳細やプロフィールでも、入口によって戻り先が変わるため重要です。

## 現行 route map

### 主要な公開 / 認証画面

- `/`
- `/coordinate`
- `/challenge`
- `/notifications`
- `/my-page`
- `/my-page/[id]`
- `/my-page/credits`
- `/my-page/credits/purchase`
- `/my-page/account`
- `/my-page/contact`
- `/posts/[id]`
- `/users/[userId]`
- `/login`
- `/signup`
- `/reset-password`
- `/reset-password/confirm`
- `/about`
- `/pricing`
- `/terms`
- `/privacy`
- `/tokushoho`
- `/payment-services-act`
- `/thanks-sample`
- `/search`
- `/free-materials`
- `/account/reactivate`
- `/i2i/[slug]`

### 認証補助 route

- `/auth/callback`
- `/auth/x-complete`

## 旧 screen-flow からの主な差分

- `/challenge` と `/notifications` は現行の主要ナビゲーションです。
- `/my-page/[id]` は現行実装に存在し、将来予定ではありません。
- `/my-page/credits/purchase` は専用の購入ページとして存在します。
- `/home`、`/credits/purchase`、`/mypage/images/[id]` は現行の正規ユーザー route として扱わないでください。
- 管理導線には、ユーザー検索、審査、通報、デフォルト設定、付与、減算、集計、画像最適化、監査ログが含まれます。

## 関連ドキュメント

- `docs/product/requirements.md`
- `docs/planning/implementation-roadmap.md`
- `docs/architecture/data.md`
- `../../app/`
