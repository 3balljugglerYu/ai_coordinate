# One-Tap Style クリエイター通知 実装計画書

- 作成日: 2026-08-04
- ステータス: レビュー待ち
- 前提機能: 派生投稿の実名通知（A案 #476）・利用数マイルストーン通知（B案 #477）— 本機能は両者の **One-Tap Style 版ミラー**
- 先行調査: 眠っている creator_looks 通知基盤（inspire 用として DB 側は完成・現役）は One-Tap Style に構造的に乗らないことを確認済み（`style_template_id` は `user_style_templates` 専用 FK・One-Tap のプリセット ID は `generation_metadata->'oneTapStyle'->>'id'` にのみ存在・帰属列も別）

## 0. 背景と決定事項

One-Tap Style のプリセットにはクリエイター帰属（`style_presets.provider_user_id`、無ければ `preset_categories.provider_user_id`）とクレジット表示 UI が既に稼働している（公開173プリセット中25件＋4カテゴリ、allowlist 登録クリエイター5名）。しかし利用・投稿されてもクリエイターには何も届かない。

ヒアリングでの決定事項（2026-08-04）:

| 論点 | 決定 |
|------|------|
| 通知の型 | **両方**: 投稿時の実名通知（A案ミラー）＋生成の節目の匿名通知（B案ミラー） |
| 対象クリエイター | **クレジット表示と同じ解決規則**（プリセット単位 provider 優先→カテゴリ provider フォールバック = `resolveStylePresetProvider` と一致） |
| 既存10 type（creator_looks/style_template/catalog）のフロント受け皿 | **別タスク**（本番28件が日本語生文言表示中だが新規発火はほぼ無い） |
| 過去分 | ゼロベースライン（B案 ADR-002 と同じ「通算×ちょうど一致のみ発火」方式） |

本番実測（2026-08-04）: One-Tap 生成 2,245件・投稿725件。うちクリエイター帰属分は生成982件（プリセット直接631＋カテゴリ351）・投稿332件。ジョブ数≒画像数（2,259 vs 2,247）のため **generated_images の INSERT を「生成1回」として数える**。`profiles.id = user_id`（全件一致を実測）のため `provider_user_id` はそのまま通知宛先に使える。

## 1. 設計（A案・B案からの差分のみ）

### 通知タイプ2種

| type | 契機 | 実名/匿名 | entity | 文言例 |
|------|------|----------|--------|--------|
| `style_preset_post_published` | プリセット利用画像の投稿（`is_posted` false→true） | **実名**（actor=投稿者） | `post`（投稿画像） | 「ゆきがあなたの「桜メイド服」のスタイルで作品を投稿しました」 |
| `style_preset_usage_milestone` | 生成の累計が節目にちょうど到達（`generated_images` INSERT） | **匿名**（actor=recipient） | `user`（provider 本人） | 「あなたの「桜メイド服」のスタイルが50回利用されました」（初回は専用文言） |

### 主要な設計判断（ADR）

- **ADR-001 プリセット ID は JSONB のまま使う**: 新 FK 列は足さず、`(generation_metadata->'oneTapStyle'->>'id')` の**部分式インデックス**を `generated_images` に新設して数える。既存2,247行のバックフィル不要・書き込み経路（`app/(app)/style/generate-async/handler.ts` / 完了RPC）も無変更。
- **ADR-002 provider 解決はクレジット表示と同一規則**: `COALESCE(style_presets.provider_user_id, preset_categories.provider_user_id)`。NULL なら通知しない。`status` では絞らない（クレジットが出ている相手＝通知が届く相手、の一致を優先）。
- **ADR-003（改）節目判定は B案 ADR-002 を踏襲し、累計の正本は append-only の `style_preset_usage_events`**: 画像は本人が物理削除できるため `generated_images` の count は「累計」にならない（実装レビュー指摘②）。#477 の `prompt_usage_events` と同型のイベント表を新設し、既存分をバックフィル（節目トリガー作成前に実行し過去分の発火を防ぐ）、信頼済み INSERT からトリガーで記録する。通算（provider 除外）×ちょうど一致のみ発火・`LIMIT 1001` 打ち切り・節目 {1,5,10,25,50,100,250,500,1000}・初回は専用文言。人気プリセットは次の節目から自然に再開＝遡及なし。
- **ADR-004 milestone の entity は `user`（provider 本人）**: プリセットには投稿ページが無いため。タップ遷移は `data.preset_slug` から `/styles/{slug}`（公開SEOページ）へ向ける専用分岐を1つ追加（slug 欠損時は既存の user 分岐で自分のプロフィールへフォールバック）。一覧サムネは `data.image_url`（プリセットサムネを焼き込み・enrichment 不要の既存フォールバック経路）。
- **ADR-005 投稿通知の削除は entity 一致で行う**: 非公開化（取消・公開停止・退会）で `type + entity_id=画像ID` の DELETE（A案と同じリンク切れ回避）。milestone はプリセット非公開でも削除しない（利用実績は消えない事実。`/styles/{slug}` が404になる可能性は許容）。
- **ADR-006 create_notification の使い分け**: 実名側は `create_notification` 経由（A案と同じ・自己スキップ流用）、匿名側は直接 INSERT（B案と同じ・self-skip 回避）。冪等化は部分ユニークインデックス2本（実名=5列 / 匿名=式 `(data->>'preset_id', data->>'milestone')`）。
- 実名側は投稿者×provider の**双方向ブロック**で抑止（A案 REQ-004 同等）。自己利用（provider 本人の投稿・生成）は通知・カウントとも対象外。
- **ADR-007 生成由来フィールドの保護（実装レビュー指摘①・Critical）**: `generated_images` はクライアント INSERT/UPDATE ポリシーが実在し通知偽造が成立していた。クライアント INSERT をポリシーごと撤去（正規経路は完了RPC=SECURITY DEFINER と wardrobe claim=service_role のみ・アプリのクライアント INSERT ゼロを確認済み）し、`generation_type` / `generation_metadata` / `image_job_id` / `style_template_id` の非信頼 UPDATE を BEFORE トリガーで拒否。眠っている creator_looks 投稿通知の偽造経路（`style_template_id` 差し替え）も同時に塞がる。
- **ADR-008 provider の auth uid は profiles join で解決（実装レビュー指摘③）**: `provider_user_id` は `profiles.id` への FK で、`id = user_id` は CHECK の無い偶然一致。`profiles.user_id` を明示的に引いて通知宛先・自己利用判定に使う。
- **ADR-009 公開前のテスト生成を除外する（記録時点ゲート。20260805120000）**: 運営は公開前に admin_only カテゴリ・非公開プリセット・予約公開の期間外でテスト生成する。これが記録されると「provider 設定済みなら節目通知が運営テストで発火」「未設定でも累計を先に消費して実ユーザーの『初めて』通知が**欠落**する（節目1は一度しか交差しない）」の2重汚染になる。対策は生成された瞬間の公開状態（`sp.status='published' AND pc.visibility='public' AND pc.is_active` **かつカテゴリ表示期間 `[starts, ends)` 内**＝アプリ側の公開判定 20260610130000 と同一）を満たす生成だけを記録する記録時点ゲート。実名投稿通知は「投稿時点で公開中」に加え**「生成時点でも適格だった」ことを利用イベントの存在で要求**する（公開前テスト画像をローンチ後に作例投稿しても通知されない）。過去イベントは、**未公開（published_at IS NULL）プリセット分＝確実にテスト由来を削除**して今後のローンチの「初めて」を復元し、公開済みプリセット分は残置（当時の状態は復元不能。残したテストイベントがあるプリセットでは「初めて」が出ず節目も早く到達する制約が残る）。

### EARS 要約（A/B案の REQ を継承し対象を読み替え）

- REQ-001: 投稿遷移＋`oneTapStyle.id` あり＋provider 解決可のとき実名通知（1投稿=1通知・ユニークインデックスで最大1件）
- REQ-002: 非公開化でその投稿の実名通知を削除。再投稿で再通知（A案 ADR-005 対称性）
- REQ-003: 生成 INSERT で通算（provider 除外）がちょうど節目のとき匿名通知。プリセット×節目ごと最大1件
- REQ-004: 自己利用は通知もカウントもしない。実名側は双方向ブロックで抑止
- REQ-005: 匿名側は actor enrichment・アバター導線なし・運営ロゴ（`isAnonymousActorNotificationType` へ追加）。実名側はアバタータップで投稿者プロフィールへ（actor-link predicate へ追加）
- REQ-006: 見出しはプリセット名（`data.preset_title` スナップショット・書記素20文字切り詰め）を含む15ロケール文言。milestone タップは `/styles/{slug}`、実名タップは投稿詳細（既存汎用分岐）
- REQ-007: 通知処理の失敗は WARNING に留め、投稿・生成完了トランザクションを巻き込まない
- REQ-008: 通知OFF設定なし（既存方針踏襲）

## 2. 実装フェーズ

### Phase 1: DB マイグレーション（`add_style_preset_creator_notifications.sql`）

- **生成由来フィールドの保護（ADR-007）**: クライアント INSERT ポリシー撤去＋INSERT 権限 REVOKE＋非信頼 UPDATE を拒否する BEFORE トリガー
- CHECK に2 type 追加（20値）
- **`style_preset_usage_events` 新設（ADR-003改）**: 既存 One-Tap 生成のバックフィル（節目トリガー作成前）＋ `trg_record_style_preset_usage`（信頼済み INSERT からの記録）
- `generated_images` に部分式インデックス、イベント表 preset インデックス、通知側ユニークインデックス2本（実名=5列部分 / 匿名=式部分）
- 通知系の関数+トリガー（すべて EXCEPTION ガード付き・REQ-007。provider 解決は profiles join=ADR-008）:
  - `notify_on_style_preset_post_published`: `AFTER UPDATE OF is_posted` WHEN（遷移true＋generation_type='one_tap_style'＋oneTapStyle あり）。provider 解決→自己スキップ→双方向ブロック→`create_notification`（data: preset_id/preset_title/preset_slug）
  - `delete_style_preset_post_notification`: WHEN（遷移false＋同条件）。`type + entity_id` で DELETE
  - `notify_on_style_preset_usage_milestone`: **`AFTER INSERT ON style_preset_usage_events`**。provider 解決→自己スキップ→通算カウント（イベント正本・provider 除外・LIMIT 1001）→ちょうど節目→直接 INSERT（匿名・data: preset_id/preset_title/preset_slug/milestone/image_url=サムネ）
- 検証: カタログ検証＋ロールバック式実データ dry-run（一時カテゴリ+一時プリセット（provider=実在u1）を作成→u2の生成1回で「初めて」→2〜4回目は増えない→5回目で2件目→u1自身の生成は不変→投稿で実名通知→取消で実名側だけ削除・milestone 残存→全ロールバック）

### Phase 2: フロント表示

- `types.ts`: 2 type 追加・`data.preset_id/preset_title/preset_slug` 追加・`ANONYMOUS_ACTOR_NOTIFICATION_TYPES` に milestone 追加
- `presentation.ts`: 3キー（`stylePresetPostTitle` / `stylePresetUsageMilestoneFirstTitle` / `stylePresetUsageMilestoneTitle`）。preset 名は `truncateOriginCaption` 再利用。data 欠損時は DB フォールバック
- `useNotifications.ts`: milestone 用の遷移分岐1つ（`data.preset_slug` → `/styles/{slug}`）。実名側は汎用 post 分岐のまま
- `NotificationList.tsx`: アイコン2 case（実名=Shirt / 匿名=PartyPopper）・actor-link predicate に実名 type 追加
- 15ロケール×3キー

### Phase 3: テスト・ドキュメント同期

- presentation 4ケース・useNotifications 遷移1ケース・NotificationList（実名のアバター導線/匿名の運営ロゴ）
- `data.ja.md`/`data.en.md` Trigger 一覧+3行・`database-design.mdc`（インデックス2本・通知連動3関数）

### go-live

PR マージ → デプロイ → **マイグレーションはオーナーと一緒に db push** → 実機確認（provider 付きプリセットで別アカウントが生成→provider に「初めて」or 次節目 / 投稿→実名通知→タップ遷移）。人気プリセットは通算が節目を過ぎているため、確実に試すなら**新規プリセットに provider を設定**して使う。

見積り: 1〜1.5日 / PR 1本（`feat/style-preset-creator-notification`）

## 3. スコープ外

- 既存10 type（creator_looks/style_template/catalog）のフロント受け皿整備（**別タスク**・本番28件が日本語生文言のまま）
- クリエイター向け利用状況ダッシュボード（通知から誘導する先の拡充）
- 通知OFF設定
