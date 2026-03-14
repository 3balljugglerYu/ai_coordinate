# 実装優先度・ロードマップ

- Last updated: `2026-03-14`
- Audience: Developers and maintainers tracking implementation status
- Role: Canonical Japanese planning and current implementation status document
- Verified against repository sources:
  - `app/**`
  - `features/**`
  - `supabase/migrations/**`
  - `docs/product/requirements.md`
  - `docs/product/screen-flow.md`
- Operational confirmation:
  - 本番 Stripe 運用完了は repository owner 確認済み

## このドキュメントの役割

このドキュメントは、初期計画の理想形ではなく、現行リポジトリを基準にした「現在地」と「残タスク」を共有するための正本です。

過去のロードマップには、次のようなズレがありました。

- すでに実装済みの機能が未着手扱いのまま残っていた
- 現在の UI と異なる導線やソート仕様が残っていた
- Stripe や bonus 機能のように「モックだけ」ではなく、実装と運用準備が混在している領域が整理されていなかった
- 管理画面、通報、監査、通知、アカウント管理など、後から増えた機能群が十分反映されていなかった

以降は、現行実装ベースで整理しています。

## 現在地の要約

### 全体スナップショット

- コア体験は実装済み
  - 閲覧
  - 登録 / 認証
  - 画像生成
  - 投稿
  - いいね / コメント / フォロー
  - 通知
  - マイページ
  - ペルコイン残高 / 履歴
- グロース機能も概ね実装済み
  - チュートリアル
  - ストリーク
  - 紹介コード
  - デイリー投稿特典
- 決済も完了
  - Checkout API
  - Webhook
  - 購入反映
  - 取引履歴
  - 本番運用
- 運営機能は初期計画より広く実装済み
  - 審査
  - 通報
  - 付与 / 減算
  - 既定値設定
  - 集計
  - 監査ログ
  - バナー / フリー素材管理

### ステータス表

| 領域 | 状態 | 進捗感 | 補足 |
| --- | --- | --- | --- |
| Phase 1 基本機能 | 完了 | 100% | 生成、プレビュー、保存まで動作 |
| Phase 2 認証・マイページ | 完了 | 100% | Auth、My Page、Credits、Account まで実装 |
| Phase 3 投稿機能 | 完了 | 100% | 投稿、一覧、詳細、編集、戻り導線まで実装 |
| Phase 4 いいね・コメント | 完了 | 100% | いいね、コメント、一覧反映、通知連携あり |
| Phase 5 ユーザープロフィール | 完了 | 100% | 他ユーザープロフィール、編集、フォローあり |
| Phase 6 シェア・SEO | 概ね完了 | 90% | Web Share / コピー / metadata 実装済み |
| Phase 7 特典・キャンペーン | 完了 | 100% | tutorial / streak / referral / daily post 実装済み |
| Phase 8 ペルコイン・決済 | 完了 | 100% | 購入、反映、履歴、運用を含めて完了 |
| Phase 9 X連携・外部SNS個別導線 | 一部実装 | 30% | X OAuth ロジックあり、UI は非表示 |
| Phase 10 フリー素材・バナー | 完了 | 100% | 公開ページと管理画面を含めて実装済み |
| Phase 11 運営・保守機能 | 完了 | 100% | 初期計画外だが実装済み |

**現行プロダクトスコープの体感進捗**: 約 `90-95%`  
注: これは実装済み画面・API・DB 挙動ベースの運用目線の概算です。将来構想や運用準備まで含めた厳密な百分率ではありません。

---

## Phase 1: 基本機能

**状態**: 完了

### 実装済み

- 画像アップロード UI
- 生成フォーム
- 非同期画像生成
- 生成進捗表示
- 生成結果プレビュー
- 画像拡大表示
- 複数画像生成時のギャラリー表示
- Supabase Storage への保存
- 生成メタデータ保存

### 実装の主な根拠

- `app/api/generate-async/route.ts`
- `app/api/generation-status/route.ts`
- `features/generation/components/*`
- `features/generation/lib/*`
- `supabase/functions/image-gen-worker/`

### 補足

- 旧 roadmap では nanobanana の単純同期呼び出し前提の記述が残っていたが、現行は job / worker ベースの非同期構成が中心

---

## Phase 2: 認証・マイページ

**状態**: 完了

### 実装済み

- Email / Password 認証
- Google OAuth
- セッション管理
- 新規登録特典 50 ペルコイン
- My Page
- 所有画像一覧
- 所有画像詳細
- `/my-page/credits`
- `/my-page/credits/purchase`
- `/my-page/account`
- `/my-page/contact`
- `/account/reactivate`

### 実装の主な根拠

- `app/(app)/login/page.tsx`
- `app/(app)/signup/page.tsx`
- `app/(app)/my-page/**`
- `app/(app)/account/reactivate/page.tsx`
- `features/my-page/**`
- `features/account/**`
- `features/auth/**`

### 補足

- 旧 roadmap よりも実装範囲は広い
- 単なる一覧画面だけでなく、アカウント管理、通報履歴、ブロック、退会関連まで含まれる

---

## Phase 3: 投稿機能

**状態**: 完了

### 実装済み

- 投稿モーダル
- キャプション入力
- 投稿一覧
- 投稿詳細
- 編集
- 投稿取り消し
- 未投稿画像の削除
- Sticky header による戻り導線制御
- Home を投稿一覧として利用
- 現行タブ: 新着 / オススメ / フォロー

### 実装の主な根拠

- `app/page.tsx`
- `app/posts/[id]/page.tsx`
- `app/api/posts/**`
- `features/posts/**`
- `features/home/**`

### 補足

- 旧 roadmap にあった `daily / week / month` を前面に出す UI は現行仕様ではない
- 現在の主要タブは `newest / week / following`

---

## Phase 4: いいね・コメント・通知

**状態**: 完了

### 実装済み

- いいね
- いいね解除
- いいね状態取得
- コメント投稿
- コメント編集
- コメント削除
- コメント一覧
- 投稿詳細でのリアクション表示
- 通知一覧
- 既読化
- 全既読
- 未読数バッジ
- bonus notification toast

### 実装の主な根拠

- `app/api/posts/[id]/like/route.ts`
- `app/api/posts/[id]/comments/route.ts`
- `app/api/comments/[id]/route.ts`
- `app/api/notifications/**`
- `features/posts/components/LikeButton.tsx`
- `features/posts/components/CommentSection.tsx`
- `features/notifications/**`

### 補足

- 旧 roadmap は「通知機能は将来」と読める箇所があったが、現行は通知ページと未読バッジまで存在する

---

## Phase 5: ユーザープロフィール機能

**状態**: 完了

### 実装済み

- 他ユーザープロフィール
- プロフィール編集
- アバターアップロード
- bio 編集
- フォロー導線
- プロフィールから投稿詳細への遷移
- 投稿一覧のページネーション

### 実装の主な根拠

- `app/(app)/users/[userId]/page.tsx`
- `app/api/users/[userId]/**`
- `features/my-page/components/UserProfilePage.tsx`
- `features/users/components/FollowButton.tsx`

---

## Phase 6: シェア・SEO

**状態**: 概ね完了

### 実装済み

- Web Share API ベースのシェア
- クリップボードへのリンクコピー
- 投稿詳細メタデータ生成
- ホームページメタデータ
- ユーザープロフィールメタデータ

### 実装の主な根拠

- `features/posts/components/ShareButton.tsx`
- `app/posts/[id]/page.tsx`
- `app/page.tsx`
- `app/(app)/users/[userId]/page.tsx`

### 未完了 / 方針見直し対象

- Twitter/X、Facebook、LINE それぞれの専用シェア導線は現行では主導線ではない
- 現在は「OS / browser の共有機能 + URLコピー」を正規導線として扱う方が実装実態に近い

---

## Phase 7: 特典・キャンペーン機能

**状態**: 完了

### 実装済み

- チュートリアル開始導線
- チュートリアル完了 bonus
- ストリーク bonus
- 紹介コード生成
- 紹介成立 bonus
- デイリー投稿 bonus
- Challenge 画面での表示
- 通知との連携

### 実装の主な根拠

- `app/(app)/challenge/page.tsx`
- `features/challenges/**`
- `features/referral/**`
- `app/api/tutorial/complete/route.ts`
- `app/api/streak/check/route.ts`
- `app/api/referral/generate/route.ts`
- `app/api/referral/check-first-login/route.ts`
- `supabase/migrations/*bonus*`

### 補足

- 旧 roadmap では Phase 7 が 25% 扱いだったが、現行実装とは一致しない

---

## Phase 8: ペルコイン・決済機能

**状態**: 完了

### 実装済み

- Percoin package 定義
- 購入 UI
- Checkout Session 作成
- Stripe Pricing Table / 独自購入 UI
- 残高表示
- 残高 API
- 消費 API
- 取引履歴表示
- Webhook
- 冪等な購入記録
- モック完了フロー
- 失効間近 free Percoin の可視化
- 本番 Stripe 運用

### 実装の主な根拠

- `features/credits/**`
- `app/api/credits/**`
- `app/api/stripe/webhook/route.ts`
- `app/(app)/my-page/credits/**`
- `docs/business/monetization.md`

### 補足

- 現在は実装だけでなく運用面も完了として扱う
- モック経路は開発・フォールバック用途として残っていても、Phase の完了判定とは分けて扱う

---

## Phase 9: X連携・外部SNS個別導線

**状態**: 一部実装

### 実装済み

- X OAuth を考慮した auth client ロジック
- `/auth/callback`
- `/auth/x-complete`
- referral と OAuth 復帰の考慮

### 実装の主な根拠

- `features/auth/lib/auth-client.ts`
- `app/auth/callback/route.ts`
- `app/auth/x-complete/page.tsx`

### 未完了

- Auth UI 上の X ログインボタンは現在非表示
- GitHub OAuth も UI では非表示
- Twitter/X、Facebook、LINE 個別のシェア導線は現行主導線ではない

### 判断

- この Phase は「0%」ではない
- ただし「ユーザー向けに有効化済み」とも言えないため、部分実装として扱う

---

## Phase 10: フリー素材・バナー管理

**状態**: 完了

### 実装済み

- フリー素材公開ページ
- フリー素材管理画面
- フリー素材 API
- バナー公開 API
- バナー管理画面
- 並び替え
- 表示制御

### 実装の主な根拠

- `app/free-materials/page.tsx`
- `app/api/banners/route.ts`
- `app/api/admin/banners/**`
- `app/api/admin/materials-images/**`
- `app/(app)/admin/banners/page.tsx`
- `app/(app)/admin/materials-images/[slug]/page.tsx`

---

## Phase 11: 運営・保守機能

**状態**: 完了

### 実装済み

- 管理ダッシュボード
- ユーザー検索
- ユーザー詳細
- 投稿審査
- 通報一覧
- bonus 付与
- bonus 一括付与
- 減算
- Percoin 集計
- デフォルト値管理
- 画像最適化管理
- 監査ログ
- アカウント停止 / 再有効化
- 通報 / ブロック履歴

### 実装の主な根拠

- `app/(app)/admin/**`
- `app/api/admin/**`
- `features/admin-dashboard/**`
- `features/moderation/**`
- `features/account/**`

### 補足

- この領域は旧 roadmap に十分含まれていなかった
- 現在の運営機能は、初期計画よりかなり広い

---

## 直近の優先タスク

### 優先度 高

- roadmap / requirements / monetization の数値同期を維持する
- 現行 UI に合わせて、古い `daily / month` 主導の説明を減らす

### 優先度 中

- X ログインを本当に公開するか判断し、使わないなら計画から外す
- 個別 SNS シェア導線を追加するか、現行の Web Share 方針で固定するか判断する
- マイページ画像一覧の大量データ時 performance を再評価する
- 期間別ランキングの計算コストに対して cache / materialized view の導入を検討する

### 優先度 低

- 仮想スクロールの導入検討
- 一部画像への `priority` 付与など、初期表示最適化
- planning doc をさらに issue / epic 単位へ分解する

---

## 更新ルール

- このファイルは「将来やりたいことのメモ」ではなく、現行実装ベースの status doc として更新する
- 実装済み判定は、画面、API、DB 挙動のいずれかではなく、ユーザーまたは運営が実際に使える単位で判断する
- モックと本番が共存する場合は、「未実装」ではなく「実装済み / 運用準備中」と明記する
- product docs とズレたら、`requirements.md`、`screen-flow.md`、`monetization.md` も同時に見直す
