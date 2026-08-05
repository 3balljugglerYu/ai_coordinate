# 「これまでに◯◯回つくられました」公開前テスト除外（記録時ゲート） 実装計画書

作成日: 2026-08-05
ステータス: A案（記録時ゲート・最小）でユーザー承認済み → 実装（本計画書は実装と同一 PR に同梱）

## 背景・ゴール

ホーム・/style・/styles の「これまでに◯◯回つくられました」（プリセット別）と /style 上部の
「これまでに生成された枚数 N 枚！」（サイト全体）は `style_usage_events`（`event_type='generate'`）の
集計で、**記録時に公開状態のチェックが無い**。そのため admin_only カテゴリでの公開前テスト生成も
カウントに乗る。

本対応（A案）では、**公開中でないプリセットに紐づく利用イベントを記録しない**ようにする。
判定条件は #479（クリエイター通知の `style_preset_usage_events` ゲート）と同一:

```
status='published' × カテゴリ visibility='public' × is_active × 表示期間 [starts, ends) 内
```

- 過去のテストイベントは残す（表示は不変。気になるプリセットは依頼ベースで個別対応）
- admin テストが KPI 集計からも消えるが、それはノイズ除去として許容（ユーザー承認済みの A案）
- 通知用 `style_preset_usage_events`（#479 でゲート済み）とは別テーブル。今回は表示・KPI 用の
  `style_usage_events` が対象

## コードベース調査結果

| 対象 | 場所 | 現状 |
|------|------|------|
| カウンタのデータ源 | `features/style/lib/style-popularity.ts`（プリセット別・`get_style_generate_counts` RPC）/ `style-usage-stats.ts`（サイト全体） | `style_usage_events` の `event_type='generate'` を集計。公開状態の条件なし |
| 記録関数 | `features/style/lib/style-usage-events.ts` `recordStyleUsageEvent` | admin client で無条件 INSERT |
| 記録面①（本命） | `app/(app)/style/events/handler.ts` | クライアント送信イベント（visit/download/**generate**/signup_click/wardrobe_save_click）。**async（認証）フローの 'generate' はここだけ**で記録される。styleId 指定時は `getPublishedStylePresetById(styleId, { includeAdminOnly })` で**プリセット取得済み** → 追加クエリ不要でゲート可能 |
| 記録面② | `app/(app)/style/generate/handler.ts`（sync=ゲスト経路） | rate_limited / generate_attempt / generate（成功時）。**admin_only カテゴリは既に 400 拒否**（`handler.ts` 内 visibility チェック）のため実質は表示期間外・is_active=false の防御追加。全記録箇所がプリセット取得後 |
| 記録なし | `app/(app)/style/generate-async/handler.ts` | `recordStyleUsageEvent` は import のみで**呼び出しゼロ**（'generate' はクライアント→記録面①経由）。変更不要 |
| スコープ外 | `app/api/collections/mount|share-event`、`app/api/wardrobe/claim` | mount_generated / mount_shared / wardrobe_save_completed はプリセット生成フローではない別ライフサイクル。カウンタにも無関係 |
| 期間判定ヘルパー | `features/collections/lib/collection-display-period.ts` `isCollectionDisplayPeriodActive` | [starts, ends) 判定 = #479 の SQL ゲートと同一セマンティクス。再利用する |
| 既存テスト | `tests/integration/app/style-events-route.test.ts` / `style-generate-route.test.ts` | DI（dependencies 注入）方式。ゲートのケースを追加拡張できる |

## 設計

新規の共有述語 `features/style-presets/lib/style-preset-usage-recording.ts`:

```
shouldRecordStylePresetUsage(preset):
  (preset.status が無い型では published 前提、あれば 'published' を要求)
  && category.visibility === 'public'
  && category.isActive
  && isCollectionDisplayPeriodActive(category の表示期間)
```

- 記録面①: styleId 指定時、取得済みプリセットが述語 false なら**記録せず `{ ok: true }` を返す**
  （トラッキング失敗は UX に影響させない既存方針と同じ。エラーにしない = プリセット状態の漏洩も防ぐ）。
  styleId ありイベント全種（generate だけでなく download 等）を同一ルールでスキップし、
  「公開中でないプリセットの利用イベントは一切記録しない」という一貫した意味論にする
- 記録面②: プリセット取得後に述語を 1 回評価し、rate_limited / generate_attempt / generate の
  記録をスキップ（生成自体は今までどおり動く。記録だけしない）
- DB 変更なし・マイグレーションなし（アプリ層のみ）→ 適用順序の制約もなし

### ADR-001: DB トリガーではなくアプリ層でゲートする

- **Context**: #479 は DB 関数内でゲートした。今回も DB トリガー化は可能。
- **Decision**: アプリ層（記録呼び出し前）でゲートする。
- **Reason**: `style_usage_events` は INSERT がアプリの `recordStyleUsageEvent` 一本に集約済みで、
  記録面①②とも**プリセットが取得済み**のため追加クエリゼロでゲートできる。DB トリガーだと
  イベント行→プリセット→カテゴリの JOIN が全 INSERT に走る。#479 と違い「クライアント直
  INSERT 経路」は存在しない（RLS 全拒否・service_role のみ）ため、アプリ層で十分。
- **Consequence**: 将来 INSERT 経路を増やす場合は述語の適用を忘れないこと（`style-usage-events.ts`
  のコメントで明示する）。

## 実装計画

### Phase 1: 共有述語 + 記録面①②のゲート
- [ ] `features/style-presets/lib/style-preset-usage-recording.ts` 新規（述語 + JSDoc で #479 と同一条件であることを明記）
- [ ] `app/(app)/style/events/handler.ts` — 取得済みプリセットで述語評価 → false なら記録スキップで ok 応答
- [ ] `app/(app)/style/generate/handler.ts` — 述語 false なら 3 種の記録をスキップ
- [ ] `features/style/lib/style-usage-events.ts` — 「新規 INSERT 経路を作る場合は述語を通すこと」のコメント追記

### Phase 2: テスト + ドキュメント + 検証
- [ ] 述語の単体テスト（4 条件 × 境界: 期間 [starts, ends)・is_active・visibility・status）
- [ ] `style-events-route.test.ts` — admin + 非公開プリセット → `ok:true` かつ記録関数未呼び出し / 公開中 → 記録される
- [ ] `style-generate-route.test.ts` — ゲート時に generate 記録がスキップされるケース
- [ ] `docs/architecture/data.ja.md` / `data.en.md` の該当箇所（必要なら）+ `.cursor/rules/database-design.mdc` は DB 変更なしのため対象外
- [ ] `npm run lint` / `typecheck` / `test` / `build -- --webpack` 全通過

## 品質・テスト観点

- [ ] **後方互換**: 公開中プリセットの記録は 1 件も変わらない（既存テストが緑のまま）
- [ ] **UX 不変**: ゲート時もクライアントにはエラーを返さない（生成は成功・記録だけスキップ）
- [ ] **KPI 影響の明示**: admin テストが今後 KPI に乗らなくなることを PR 本文に記載
- [ ] 過去イベントは無変更（カウンタが下がらない）

## ロールバック方針

- アプリ層のみ・DB 変更なし。revert 一発で完全に元に戻る
