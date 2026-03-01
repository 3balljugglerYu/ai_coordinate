# ペルコイン取引履歴ブランチ コードレビュー

**ブランチ:** `feature/percoin-history`  
**レビュー日:** 2025-02-28  
**参照スキル:** vercel-react-best-practices, supabase-postgres-best-practices

---

## 1. 実装概要

- 保有ペルコインの内訳表示（無期限 / 期間限定）
- 取引履歴のフィルタ（すべて / 無期限 / 期間限定 / 利用履歴）
- 期間限定の有効期限表示・内訳展開
- ページネーション対応
- 用語統一（消費→生成利用、返金→生成失敗返却 等）
- 払い戻しの期間限定フィルタ除外
- 保有ペルコインカードの購入画面遷移削除
- ペルコイン管理画面の戻るボタン表示

---

## 2. Vercel React Best Practices 観点

### ✅ 良い点

#### async-parallel（Promise.all による並列取得）
- **CachedPercoinPageContent**: `Promise.all` で breakdown / transactions / batches を並列取得
- **PercoinPageContent.refreshAll**: `Promise.all` で 4 件を並列取得
- **PercoinPageContent.refreshTransactions**: `Promise.all` で transactions / count を並列取得
- **admin/users/[userId]/page.tsx**: `Promise.all` で 8 件を並列取得

#### server-cache-react（React.cache による重複排除）
- `getPercoinBalanceServer`, `getPercoinTransactionsServer`, `getPercoinBalanceBreakdownServer`, `getFreePercoinBatchesExpiringServer` が `cache()` でラップされている

#### rerender-useCallback
- `refreshAll`, `refreshTransactions`, `handleFilterChange`, `handleNextPage`, `handlePageClick` が `useCallback` でメモ化されている
- `PeriodLimitedBreakdown` の `handleClick`, `handleKeyDown` も `useCallback` 使用

#### rendering-conditional-render
- `{periodLimitedExpanded && balanceBreakdown.period_limited > 0 && (...)}` は三項演算子ではないが、`&&` による条件付きレンダリングは許容範囲

### ⚠️ 改善提案

#### 2.1 フィルタ変更時の重複 API 呼び出し（async-parallel の無駄）

**現状:** `txFilter` 変更時に `refreshAll` と `refreshTransactions(0)` の両方が実行される。

```tsx
// PercoinPageContent.tsx
useEffect(() => {
  refreshAll();  // breakdown, transactions, batches, count の 4 件
}, [refreshAll]);  // refreshAll は txFilter に依存

useEffect(() => {
  if (isInitialMount.current) { ... return; }
  refreshTransactions(0);  // transactions, count の 2 件
}, [txFilter, refreshTransactions]);
```

`txFilter` が変わると両方の effect が走り、`getPercoinTransactions` と `getPercoinTransactionsCount` が二重に呼ばれる。

**提案:** フィルタ変更時は `refreshTransactions(0)` のみ実行し、`refreshAll` の依存から `txFilter` を外す。`refreshAll` はマウント時・`generation-complete` 時のみ実行する。

```tsx
const refreshAll = useCallback(async () => {
  // ... 現状の実装（txFilter はクロージャで最新を参照）
}, []);  // txFilter を依存から削除し、内部で ref で最新値を参照するか、
         // または refreshAll をフィルタ変更時に呼ばない設計にする
```

あるいは、フィルタ変更時は `refreshTransactions(0)` のみにし、`refreshAll` の依存配列から `txFilter` を削除して、初回マウント時のみ `refreshAll` を実行する。

#### 2.2 client-swr-dedup（SWR によるリクエスト重複排除）

**現状:** クライアント側は `useState` + `useEffect` による手動フェッチ。

**提案:** 将来的に SWR や TanStack Query を導入すると、同一キーでの重複リクエストやキャッシュが自動で効く。現状の実装でも動作は問題ないが、将来的な検討余地あり。

#### 2.3 rerender-derived-state-no-effect

**現状:** `currentPage`, `totalPages`, `hasNextPage`, `pageNumbers` はレンダー時に計算されている（`getPageNumbers` は毎回呼ばれる）。

**提案:** `getPageNumbers` の結果は `totalPages` と `currentPage` から導出されるため、`useMemo` は不要（シンプルな計算のため）。現状のままで問題なし。

---

## 3. Supabase Postgres Best Practices 観点

### ✅ 良い点

#### security-rls / security-privileges
- RPC は `SECURITY INVOKER` で `auth.uid()` を利用
- `SET search_path = public` でインジェクション対策
- `refund_percoins` は `SECURITY DEFINER` だが、`auth.uid() IS NOT NULL` の場合は例外で呼び出し拒否

#### query-missing-indexes
- `idx_fpb_credit_transaction_id`: `free_percoin_batches.credit_transaction_id` へのインデックス（JOIN 用）
- `idx_credit_transactions_user_type_created`: `(user_id, transaction_type, created_at)` の partial index
- `idx_fpb_null_credit_transaction`: バックフィル用の partial index

#### schema-foreign-key-indexes
- FK 参照カラム `credit_transaction_id` にインデックスあり

### ⚠️ 改善提案

#### 3.1 汎用取引履歴クエリ用インデックス

**現状:** `idx_credit_transactions_user_type_created` は次の partial index のため、`transaction_type IN (...)` に含まれない `purchase` と `consumption` には使われない。

```sql
WHERE transaction_type IN ('signup_bonus', 'tour_bonus', 'referral', 'daily_post', 'streak', 'admin_bonus', 'refund');
```

`p_filter = 'all'` や `p_filter = 'regular'`（purchase）では、このインデックスが使われず Seq Scan になる可能性がある。

**提案:** 汎用の `(user_id, created_at)` インデックスを追加する。

```sql
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created
  ON public.credit_transactions (user_id, created_at DESC);
```

データ量が少ないうちは影響は小さいが、将来のスケールを考えると検討の価値あり。

#### 3.2 get_percoin_transactions_count の COUNT 最適化

**現状:** `COUNT(*)` で全行を数えている。件数が多い場合に重くなる可能性がある。

**提案:** 件数が大きくなった場合は、`EXISTS` による早期終了や、別テーブルでの件数キャッシュなど、将来的な最適化の余地あり。現状の実装で問題なし。

---

## 4. その他の所見

### 4.1 CachedPercoinPageContent の getPercoinTransactionsServer 呼び出し

```tsx
getPercoinTransactionsServer(userId, PERCOIN_TRANSACTIONS_PER_PAGE, supabase),
```

`getPercoinTransactionsServer` のシグネチャは:

```ts
(userId, limit, supabaseOverride?, filter?, offset?)
```

このため、`filter` はデフォルトの `"all"`、`offset` は `0` で正しい。初回表示としては問題なし。

### 4.2 アクセシビリティ

- タブに `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `id` が適切に設定されている
- ページネーションに `aria-label`, `aria-current` が設定されている
- 期間限定の展開ボタンに `aria-expanded`, `aria-label` が設定されている

### 4.3 モバイルファースト

- タブは `min-h-[44px]` でタッチターゲットを確保
- ページネーションボタンも `min-h-[40px] min-w-[40px]` で十分なサイズ

### 4.4 型安全性

- `PercoinTransaction`, `PercoinBalanceBreakdown`, `FreePercoinBatchExpiring` など型定義が明確
- `PercoinTransactionFilter` でフィルタ値を型で制約

---

## 5. 総合評価

| 観点 | 評価 | コメント |
|------|------|----------|
| データフェッチ（並列化） | ◎ | Promise.all を適切に使用 |
| サーバーキャッシュ | ◎ | React.cache で重複排除 |
| クライアント状態管理 | ○ | フィルタ変更時の重複呼び出しのみ改善余地 |
| DB セキュリティ | ◎ | SECURITY INVOKER、auth.uid() を適切に使用 |
| インデックス設計 | ○ | 汎用クエリ用インデックスの追加を検討 |
| アクセシビリティ | ◎ | ARIA 属性が適切 |
| モバイル対応 | ◎ | タッチターゲットを確保 |

---

## 6. 推奨アクション（優先度順）

1. ~~**高:** フィルタ変更時の重複 API 呼び出しを解消~~ → **対応済**（PercoinPageContent.tsx: txFilterRef で refreshAll の依存から txFilter を削除）
2. ~~**中:** `credit_transactions (user_id, created_at DESC)` の汎用インデックス追加~~ → **対応済**（20260228000013_add_credit_transactions_user_created_index.sql）
3. **低:** 将来的な SWR / TanStack Query 導入の検討
