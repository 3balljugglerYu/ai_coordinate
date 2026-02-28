# ペルコイン取引履歴・有効期限表示 実装計画（詳細）

楽天ポイント履歴を参考にした、マイページのペルコイン管理画面の拡張計画。

**統合計画**: `.cursor/plans/ペルコイン取引履歴有効期限表示.plan.md`（本計画の詳細版）

## 参照スキル

実装時は以下のベストプラクティスに従う。

- **vercel-react-best-practices**: 非同期の並列化、バンドル最適化、サーバーキャッシュ、クライアントデータフェッチ
- **supabase-postgres-best-practices**: インデックス設計、RLS、クエリ最適化、接続管理
- **ui-ux-pro-max**: アクセシビリティ、タッチターゲット44px以上、SVGアイコン、フォーカス状態、色コントラスト4.5:1

---

## UI構成（楽天風）

### 1. 画面上部：保有ポイントの内訳

```
┌─────────────────────────────────────────────────────────┐
│  ペルコイン残高                              [購入へ]   │
│  135 ペルコイン                                          │
├─────────────────────────────────────────────────────────┤
│  うち通常          100 ペルコイン   ← 購入分（無期限）  │
│  うち期間限定       35 ペルコイン   ← タップで展開      │
└─────────────────────────────────────────────────────────┘
```

**「うち期間限定」タップ時の展開表示：**

```
┌─────────────────────────────────────────────────────────┐
│  期間限定ペルコインの内訳（有効期限が近い順）            │
├─────────────────────────────────────────────────────────┤
│  2025年8月31日迄                                        │
│    チュートリアルボーナス     20 ペルコイン              │
│    デイリー投稿ボーナス      15 ペルコイン              │
├─────────────────────────────────────────────────────────┤
│  2025年9月30日迄                                        │
│    紹介ボーナス            100 ペルコイン               │
└─────────────────────────────────────────────────────────┘
```

### 2. 画面中部：タブと並び替え

```
┌─────────────────────────────────────────────────────────┐
│  取引履歴                                               │
├─────────────────────────────────────────────────────────┤
│  [ すべて ]  [ 期間限定ポイント ]     ← タブ切り替え   │
├─────────────────────────────────────────────────────────┤
│  並び替え: [獲得した日付順 ▼]  or  [有効期限順 ▼]      │
│  ※ 期間限定タブ時のみ「有効期限順」を選択可能          │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐│
│  │ チュートリアルボーナス              +20ペルコイン   ││
│  │ 2025/2/28 14:30    有効期限: 2025年8月31日迄        ││
│  └─────────────────────────────────────────────────────┘│
│  ...（取引一覧）                                        │
└─────────────────────────────────────────────────────────┘
```

---

## データ要件

| 表示項目 | データソース |
|----------|---------------|
| 保有ポイント数 | `user_credits.balance` |
| うち通常 | `balance - sum(free_percoin_batches.remaining_amount)` |
| うち期間限定 | `sum(free_percoin_batches.remaining_amount)` where `expire_at > now()` |
| 期間限定の内訳（月順） | `get_free_percoin_batches_expiring`（既存RPC）を月でグループ化 |
| 取引履歴（すべて） | `credit_transactions` + `free_percoin_batches`（expire_at） |
| 取引履歴（期間限定のみ） | 上記のうち `expire_at` があるもののみ |

---

## Phase 1: 画面上部の内訳表示

保有数・通常・期間限定の3つを表示する。

### TODO

- [ ] RPC `get_percoin_balance_breakdown` を新規作成
  - 戻り値: `total`, `regular`, `period_limited`
  - `regular = total - period_limited`（`period_limited` は `free_percoin_batches` の合計）
  - SECURITY INVOKER、`auth.uid()` で自ユーザーに限定
  - supabase-postgres: インデックス `idx_fpb_user_expire` を活用
- [ ] `getPercoinBalanceBreakdownServer` を `features/my-page/lib/server-api.ts` に追加
- [ ] `CachedPercoinPageContent` で `getPercoinBalanceBreakdownServer` を並列取得（async-parallel）
- [ ] `PercoinBalanceCard` コンポーネントを拡張し、内訳（うち通常・うち期間限定）を表示
- [ ] モバイルファースト、タッチターゲット44px以上（ui-ux-pro-max）
- [ ] `npm run build -- --webpack` でビルド成功を確認

### ビルド確認

```bash
npm run build -- --webpack
```

Phase 1 完了時点で exit code 0 であること。

---

## Phase 2: 「うち期間限定」タップ時の展開表示

期間限定ペルコインの内訳を有効期限月順で表示する。

### TODO

- [ ] `get_free_percoin_batches_expiring`（既存RPC）を `CachedPercoinPageContent` で取得
- [ ] `Promise.all` で balance breakdown と batches を並列取得（async-parallel）
- [ ] `PeriodLimitedBreakdown` コンポーネントを新規作成
  - 月ごとにグループ化（`expire_at` を JST で日付切り出し）
  - `source` を日本語ラベルに変換（formatTransactionType と同様）
  - Collapsible / Accordion でタップで展開
- [ ] 「うち期間限定」行をタップ可能にし、展開時に `PeriodLimitedBreakdown` を表示
- [ ] `aria-expanded`、`aria-controls` でアクセシビリティ対応
- [ ] `transition-colors duration-200` でスムーズな開閉（ui-ux-pro-max）
- [ ] `npm run build -- --webpack` でビルド成功を確認

### ビルド確認

```bash
npm run build -- --webpack
```

Phase 2 完了時点で exit code 0 であること。

---

## Phase 3: タブ（すべて / 期間限定）と並び替え

取引履歴にタブと並び替えを追加する。

### TODO

- [ ] RPC `get_percoin_transactions_with_expiry` を新規作成
  - パラメータ: `p_filter` ('all' | 'period_limited'), `p_sort` ('created_at' | 'expire_at'), `p_limit` (default 10)
  - `credit_transactions` と `free_percoin_batches` を LEFT JOIN
  - `p_filter = 'period_limited'` 時は `fpb.expire_at IS NOT NULL` で絞り込み
  - `p_sort = 'expire_at'` 時は `fpb.expire_at ASC` でソート（NULL は末尾）
  - supabase-postgres: `idx_fpb_user_expire`、`credit_transactions` の user_id インデックスを活用
- [ ] `getPercoinTransactionsServer` を RPC 呼び出しに変更し、`filter`・`sort` パラメータを追加
- [ ] クライアント API `getPercoinTransactions` に `filter`・`sort` を追加
- [ ] `PercoinTransactions` にタブ（すべて / 期間限定）を追加
- [ ] 並び替えセレクト（獲得した日付順 / 有効期限順）を追加
  - 期間限定タブ時のみ「有効期限順」を有効化
- [ ] タブ・セレクトに `aria-label`、`role="tablist"` を付与（アクセシビリティ）
- [ ] `npm run build -- --webpack` でビルド成功を確認

### ビルド確認

```bash
npm run build -- --webpack
```

Phase 3 完了時点で exit code 0 であること。

---

## Phase 4: 取引履歴への有効期限表示

各取引カードに有効期限を表示する。

### TODO

- [ ] `PercoinTransaction` 型に `expire_at?: string` を追加
- [ ] `PercoinTransactions` の各取引カードで `expire_at` がある場合に「有効期限: YYYY年MM月DD日迄」を表示
- [ ] 有効期限がある取引に「期間限定」バッジを表示（`bg-amber-100 text-amber-800`、楽天風）
- [ ] テキストコントラスト 4.5:1 以上を確保（ui-ux-pro-max）
- [ ] `cursor-pointer` をタブ・展開可能要素に付与
- [ ] `npm run build -- --webpack` でビルド成功を確認

### ビルド確認

```bash
npm run build -- --webpack
```

Phase 4 完了時点で exit code 0 であること。

---

## 変更ファイル一覧（全体）

| ファイル | Phase | 変更内容 |
|----------|-------|----------|
| `supabase/migrations/YYYYMMDD_add_percoin_balance_breakdown.sql` | 1 | RPC `get_percoin_balance_breakdown` |
| `supabase/migrations/YYYYMMDD_add_percoin_transactions_with_expiry.sql` | 3 | RPC `get_percoin_transactions_with_expiry` |
| `features/my-page/lib/server-api.ts` | 1,2,3 | 新規API、RPC呼び出し |
| `features/my-page/lib/api.ts` | 3,4 | 型拡張、RPC呼び出し |
| `features/my-page/components/PercoinPageContent.tsx` | 1,2 | 内訳・展開表示の組み込み |
| `features/my-page/components/PercoinBalanceCard.tsx`（新規 or 既存拡張） | 1,2 | 内訳表示、展開UI |
| `features/my-page/components/PeriodLimitedBreakdown.tsx`（新規） | 2 | 期間限定内訳リスト |
| `features/my-page/components/PercoinTransactions.tsx` | 3,4 | タブ、並び替え、有効期限表示 |
| `features/my-page/components/CachedPercoinPageContent.tsx` | 1,2,3 | データ取得の拡張 |

---

## UI/UX チェックリスト（各Phase共通）

- [ ] タッチターゲット 44x44px 以上
- [ ] SVG アイコン（Lucide）使用、絵文字なし
- [ ] `cursor-pointer` をクリック可能要素に付与
- [ ] フォーカス状態が視覚的に分かる
- [ ] テキストコントラスト 4.5:1 以上
- [ ] 375px、768px、1024px でレスポンシブ確認
- [ ] モバイルで横スクロールが発生しない

---

## ビルドコマンド（全Phase共通）

本リポジトリでは `codex-webpack-build` に従い、以下でビルド検証を行う。

```bash
npm run build -- --webpack
```

各 Phase 完了時に上記を実行し、exit code 0 であることを確認する。
