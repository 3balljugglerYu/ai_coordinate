# プラン変更の支払いを売上として記録する計画

- 作成: 2026-10-26
- 状態: 計画（直し方をユーザーに決めてもらう）
- きっかけ: 管理ダッシュボードの概要（#805）を作る中で見つかった、もとからある抜け

## 1. 何が起きているか

サブスクの支払いは、`credit_transactions` の `subscription` の行の `metadata.revenueYen` を「売上」として数えている（`features/admin-dashboard/lib/revenue-transaction.ts`・`purchase-value.ts`）。この行は、ペルコインを付与するとき（`grant_subscription_percoins`）に一緒に書く。

ところが、**プランを途中で変えたときの支払いは、どこにも記録されていない**。

| 場合 | お金 | 今の記録 |
|---|---|---|
| はじめての契約 | Checkout の支払い | webhook `checkout.session.completed` が付与し、`revenueYen` を書く（`app/api/stripe/webhook/route.ts:558`） |
| 毎月の更新 | 請求（`subscription_cycle`） | webhook `invoice.paid` が付与し、`revenueYen` を書く（同 658行目） |
| **プランを上げる**（例: ライト → スタンダード） | 日割りの請求（`billing_cycle_anchor: "now"`・`create_prorations`） | `change-service.ts` がペルコインを付与するが、`p_metadata` を渡さない。**金額が残らない**。webhook はこの請求を付与済みとして扱い、何もしない（`shouldHandleSubscriptionInvoicePaid`・同 349-357行目） |
| **月額 → 年額**（同じプラン） | 年額の請求 | 即時の付与量が0（`getImmediateSubscriptionGrantAmount` は、月の付与量の差で決まる）。`change-service.ts` の付与の関数は、量が0なら何もせずに戻る（`amount <= 0` で `return 0`）。`grant_subscription_percoins` も、量が0だと例外になる。**行そのものが作られず、年額の支払いが丸ごと残らない** |
| 年額 → 月額・プランを下げる | 次の更新から（予約） | 次の更新の `invoice.paid` で記録される（問題なし） |

### 本番への影響（2026-10-26 時点）

- 2026年5月以降、金額の無いサブスクの行は **0件**（金額の無い6件は、4月に内部アカウントが試したもの）。
- つまり、これまでに失われた売上は無い。ただ、これから誰かがプランを上げたり年額に変えたりすると、その支払いが売上に出ない。

## 2. 直し方の案

### 案A（おすすめ）: 支払いの記録を、付与とは別の行にする

- `credit_transactions.transaction_type` に `subscription_payment` を足す（量は0。ペルコインは動かない）。
- 新しい RPC `record_subscription_payment(p_user_id, p_invoice_id, p_metadata)` を作る。
  - 同じ請求（`invoice_id`）では1回だけ書く（今の `grant_subscription_percoins` と同じく、advisory lock と `stripe_payment_intent_id` で重複を防ぐ）。
  - service_role だけが呼べる（`FROM PUBLIC, anon, authenticated`）。
- `change-service.ts` は、即時の変更で請求が済んだら、付与とは別にこれを呼ぶ。
  - 書く項目: `plan`・`billingInterval`・`revenueYen`（`latestInvoice.amount_paid`）・`revenueSource: "stripe_subscription_change"`・`mode`（`isStripeTestMode()`）。
- 売上の決まり（`isRevenueTransaction`）と、概要の SQL（`get_growth_active_users`・`get_percoin_daily_flow`）に、`subscription_payment` を足す。
- **よい点**
  - 付与の量が0でも、支払いが残る（月額 → 年額も拾える）。
  - 付与の量と金額を混ぜないので、「買った量」と「売上」が、それぞれ正しく出る。
- **気をつけること**
  - `transaction_type` の CHECK を変えるマイグレーション。CHECK を付け直すあいだ、表を一瞬ロックする。
  - ペルコインの残高の計算・集計で `transaction_type` を並べている所が、新しい種類を「付与」と取り違えないかを確かめる（量は0なので、合計には影響しない）。

### 案B: 付与の行に金額を書く

- `change-service.ts` の付与に、`p_metadata`（`revenueYen` など）を渡す。
- **よい点**: 変更が小さい（コードだけ・マイグレーションなし）。
- **足りない点**: 月額 → 年額のように付与が0の場合は、行が作られないので拾えない。

### 案C: 売上を Stripe から直接読む

- Stripe の請求（Invoice）を、管理画面の集計のときに読む。
- **よい点**: Stripe が正しい記録なので、抜けがない。
- **足りない点**: 集計のたびに外の API を呼ぶ。テスト・本番の切り替えや、内部アカウントの除外を、別に作る必要がある。今の規模では大きすぎる。

## 3. おすすめ

**案A。** 案Bでは、月額 → 年額の支払いを拾えないため。

- 必要なもの: マイグレーション1本（CHECK・RPC）、`change-service.ts` の呼び出し、売上の決まりと概要の SQL の更新、テスト。
- マイグレーションは、SQL を見せて承認をもらってから適用する。
- 過去の分を埋め直す必要はない（本番では、まだ起きていないため）。

## 4. 決めてもらうこと

1. 案A で進めてよいか。
2. 売上の名前: 管理画面では、今までどおり「売上」に、プラン変更の支払いも入れる（別の行にはしない）でよいか。
