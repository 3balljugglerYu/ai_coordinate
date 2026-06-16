# 画面遷移

英語版: [`screen-flow.en.md`](./screen-flow.en.md) ※英語版は本更新では未同期

- Last updated: `2026-06-16`
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

### ルーティングの前提(i18n / route group)

- 公開パスは next-intl のロケールプレフィックスを持つ(例: `/ja/...`、既定ロケールは省略され得る)。本書ではロケールを省いた **ユーザー視点のパス**で表記する。
- `app/` は route group で整理されている(`(app)` = 認証/アプリ本体、`(marketing)` = 公開静的ページ、`[locale]` = ロケール解決)。同一画面が複数の物理パスに現れることがあるが、ユーザーが見るパスは下記の通り。

## 主要ナビゲーション

アプリシェル下部の `NavigationBar`(モバイル)/ サイドバー(デスクトップ)に出る主要タブ:

- `/`: ホーム
- `/coordinate`(⇄ `/style`): 生成タブ。直前に One-Tap Style を使っていた場合はタップで `/style` に切り替わる(同一タブ・`/style` 滞在中もアクティブ表示)
- `/challenge`: ミッション
- `/notifications`: お知らせ
- `/my-page`: マイページ

未認証ユーザーはホーム、コーディネート(/style 含む)、各種公開閲覧画面を直接利用できます。
ミッション、お知らせ、マイページを押すと `/login?redirect=...` に遷移します。

## 主なユーザーフロー

```text
ホーム (/)
  ├─ ポップアップバナー(管理設定) / バナー帯
  ├─ One-Tap Style プリセットのカルーセル
  │    └─ プリセットタップ -> /style?style=<presetId>
  ├─ 投稿一覧タップ -> 投稿詳細 (/posts/[id])
  │    ├─ 投稿者タップ -> ユーザープロフィール (/users/[userId])
  │    └─ いいね / コメント / フォロー -> 認証必須
  │
  ├─ 生成タブ(コーディネート / One-Tap Style)
  │    ├─ /coordinate  : うちの子コーディネート生成(未認証でも 1 日 1 回お試し可)
  │    └─ /style       : One-Tap Style 生成(プリセット選択 -> 生成、認証必須)
  │         ├─ 生成 -> プレビュー / 拡大表示 -> 投稿モーダル
  │         └─ コレクション系プリセット(神コレ/ぷち神)で N 体到達
  │              -> 進捗モーダル -> 台紙コンポーザ -> コンプリート演出
  │                   └─ 台紙シェア -> /m/[token]
  │
  ├─ ミッションタップ -> 未認証なら Login
  │    └─ /challenge(連続ログイン / 紹介 / ボーナス導線)
  │
  ├─ お知らせタップ -> 未認証なら Login
  │    └─ /notifications
  │         ├─ 運営アナウンス -> /notifications/announcements/[id]
  │         ├─ フォロー通知 -> /users/[userId]?from=notifications
  │         └─ 投稿通知 -> /posts/[id]?from=notifications
  │
  └─ マイページタップ -> 未認証なら Login
       └─ /my-page
            ├─ ペルコインカード -> /my-page/credits -> /my-page/credits/purchase
            ├─ 生成画像タップ -> /posts/[id]?from=my-page
            ├─ コレクション(台紙)カード -> 進捗モーダル / 完成台紙
            ├─ アカウント -> /my-page/account
            └─ お問い合わせ -> /my-page/contact
```

## 画面グループ

### 1. ホームと閲覧導線

- `/`: ホーム。ポップアップバナー、バナー帯、**One-Tap Style プリセットカルーセル**、投稿一覧で構成(Inspire ホームカルーセルは env フラグ時のみ)
- `/posts/[id]`: 投稿詳細
- `/users/[userId]`: 公開ユーザープロフィール
- `/search`: 検索
- `/free-materials`: フリー素材

ポイント:

- ホームが既定のランディングページです。
- 投稿詳細・プロフィールは公開閲覧でき、いいね・フォロー・コメントは認証必須です。
- 戻り先は sticky header が `from` クエリで切り替えます(後述)。

### 2. 生成導線(コーディネート / One-Tap Style)

- `/coordinate`: うちの子コーディネート生成。未認証は 1 日 1 回のお試し生成が可能
- `/style`: One-Tap Style 生成(プリセット選択式)。`/style?style=<presetId>` で特定プリセットを初期選択
- 生成結果プレビュー -> 拡大表示 -> 投稿モーダル

ポイント:

- 生成タブは「コーディネート」と「One-Tap Style」をモード切替で行き来し、`NavigationBar` 上は同一タブ。
- 認証ユーザーはモデル選択・ペルコイン消費で生成。`/coordinate` のみゲストお試し対象。
- プリセットはカテゴリ単位で管理(`visibility` で公開/管理者限定、解放ゲートあり)。

### 3. コレクション(神コレ / ぷち神)導線

- `/collections/wafer`: 「うちの子の神コレクション」企画ランディング
- `/m/[token]`: 完成台紙(コンプリート)シェアページ(没入表示)
- 進捗モーダル・台紙コンポーザ・コンプリート演出はアプリ全体で発火(`CollectionProgressChecker` を AppShell にマウント)

ポイント:

- コレクション系プリセットを規定数(N)生成すると進捗モーダル -> 台紙コンポーザ -> コンプリート演出の流れ。
- 完走者向けに段階解放カテゴリ(例: ぷち神)があり、ホームで解放お知らせ(初回モーダル/段階解放モーダル)を表示。
- 解放お知らせはコンプリート演出やポップアップバナーと重ならないよう調整済み。

### 4. ミッション、お知らせ、グロース導線

- `/challenge`: ミッション(連続ログイン、紹介、ボーナス)
- `/notifications`: お知らせ一覧
- `/notifications/announcements/[id]`: 運営アナウンス詳細

ポイント:

- いずれも認証必須です。
- お知らせからは `from=notifications` を付けて投稿詳細やプロフィールへ遷移します。
- ミッション画面はチュートリアル、連続ログイン、紹介などの特典導線に使われます。

### 5. マイページとアカウント管理

- `/my-page`: プロフィール概要、生成画像一覧、コレクション(台紙)
- `/my-page/credits`: 残高と履歴
- `/my-page/credits/purchase`: ペルコイン購入
- `/my-page/account`: アカウント管理、ブロック、通報履歴、退会申請
- `/my-page/contact`: お問い合わせ
- `/account/reactivate`: 退会予約後の復帰導線

ポイント:

- マイページからは `/posts/[id]?from=my-page` の共有投稿詳細へ遷移します。
- 購入成功 / キャンセルのメッセージは `/my-page/credits/purchase` 側で扱います。
- コレクションカードからは進捗モーダル / 完成台紙を開けます。

### 6. 絵師カタログ(Catalog)導線

- `/catalog`: 絵師カタログ一覧(通常 chrome)
- `/catalog/[slug]`: カタログのリーダー画面(**没入表示**: Header / Sidebar / NavigationBar / Footer を非表示)
- `/catalog/[slug]/p/[entryId]`: カタログ内エントリの没入ビュー
- `/catalog/submit`、`/catalog/submit/thanks`: 掲載申請フロー

ポイント:

- `/catalog/[slug]` と配下のエントリ画面は没入ビュー、`/catalog` 一覧と `/catalog/submit` 系は通常 chrome を維持します。

### 7. Inspire / Creator Looks 導線

- `/inspire/[templateId]`: Creator Looks(ユーザースタイルテンプレート)詳細。Stage 1 厳密化により admin / allowlist 該当ユーザーのみ閲覧可
- `/inspire/submit`: Inspire 申請ページ(旧モーダルを 1 画面化)

### 8. 認証と復旧導線

- `/login`
- `/signup`
- `/auth/x-complete`(OAuth 完了の中継)
- `/reset-password`
- `/reset-password/confirm`

ポイント:

- ログイン画面は query param で遷移先を受け取ります。
- OAuth 完了時は最終遷移前に `/auth/x-complete` を経由することがあります。

### 9. 管理画面

`/(app)/admin/*` は admin layout で保護され、非管理者は `/` へ戻されます。主要 route:

- `/admin`(ダッシュボード)
- ユーザー / モデレーション: `/admin/users`, `/admin/users/[userId]`, `/admin/moderation`, `/admin/reports`, `/admin/audit-log`
- ペルコイン / 売上: `/admin/percoin-defaults`, `/admin/bonus`, `/admin/bonus/bulk`, `/admin/deduction`, `/admin/credits-summary`
- コンテンツ / 配信: `/admin/banners`, `/admin/popup-banners`, `/admin/announcements`, `/admin/materials-images/[slug]`, `/admin/image-optimization`
- 生成・スタイル・コレクション: `/admin/style-presets`, `/admin/style-templates`, `/admin/preset-categories`(`/new`, `/[id]`), `/admin/generation-prompts`(`/[key]`), `/admin/collections`
- 絵師カタログ: `/admin/catalog/campaigns`, `/admin/catalog/entries`

ポイント:

- 管理導線は旧 `screen-flow` より大幅に広がっています。プリセットカテゴリ・生成プロンプト・コレクション・カタログ・アナウンス等の運用画面が追加されています。

## 戻る導線のルール

現在の sticky header は `from` クエリと現在パスから戻り先を解決します。

- `from=my-page` -> `/my-page`
- `from=notifications` -> `/notifications`
- `from=coordinate` -> `/coordinate`
- `from=style` -> `/style`
- `from` 無しの `/my-page/*` 配下 -> `/my-page`
- それ以外 -> ホーム

同じ投稿詳細やプロフィールでも、入口によって戻り先が変わります。

## 現行 route map

### 主要な公開 / 認証画面

- `/`
- `/coordinate`
- `/style`
- `/challenge`
- `/notifications`
- `/notifications/announcements/[id]`
- `/my-page`
- `/my-page/credits`
- `/my-page/credits/purchase`
- `/my-page/account`
- `/my-page/contact`
- `/posts/[id]`
- `/users/[userId]`
- `/search`
- `/free-materials`
- `/collections/wafer`
- `/m/[token]`
- `/catalog`, `/catalog/[slug]`, `/catalog/[slug]/p/[entryId]`, `/catalog/submit`, `/catalog/submit/thanks`
- `/inspire/[templateId]`, `/inspire/submit`
- `/i2i/[slug]`
- `/dashboard`(認証必須の最小ダッシュボード)
- `/account/reactivate`
- `/login`, `/signup`, `/reset-password`, `/reset-password/confirm`

### マーケティング / 静的ページ

- `/about`
- `/pricing`
- `/terms`
- `/privacy`
- `/tokushoho`
- `/payment-services-act`
- `/community-guidelines`
- `/thanks-sample`
- `/credits/purchase`
- `/api-docs`

### 認証補助 route

- `/auth/x-complete`

## 2026-03 → 2026-06 の主な差分

- **One-Tap Style (`/style`)** を追加。生成タブは `/coordinate` と `/style` のモード切替に。
- **コレクション機能**(神コレ / ぷち神)を追加: `/collections/wafer` ランディング、`/m/[token]` 台紙シェア、進捗モーダル・台紙コンポーザ・コンプリート演出・段階解放お知らせ。
- **絵師カタログ(Catalog)** を追加: `/catalog`(一覧)、`/catalog/[slug]`・`/catalog/[slug]/p/[entryId]`(没入リーダー)、`/catalog/submit`(申請)。
- **Inspire / Creator Looks**: `/inspire/[templateId]`、`/inspire/submit`(admin / allowlist 限定の Stage 1)。
- **運営アナウンス**: `/notifications/announcements/[id]` と管理 `/admin/announcements`。
- 管理画面を大幅拡張: `style-presets` / `style-templates` / `preset-categories` / `generation-prompts` / `collections` / `popup-banners` / `catalog/*` 等。
- 旧表記の `/home`、`/mypage/images/[id]` は使用しないでください(`/my-page` 系が正規)。

## 関連ドキュメント

- `docs/product/requirements.md`
- `docs/planning/implementation-roadmap.md`
- `docs/architecture/data.md`
- `../../app/`
