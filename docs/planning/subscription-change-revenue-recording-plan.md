# プラン変更の支払いを売上として記録する計画

- 作成: 2026-10-26
- 状態: 実装（2026-10-30・案A。⚠️実装してわかったこと: 月額→年額は `change-service.ts` で予約の変更（期間の終わりに切り替わる）になり、日割りの請求は出ない。その年額の請求は毎月の更新と同じ付与の経路で売上が記録される。1章の表の「月額→年額」の抜けは、今のコードでは起きない。`20261030120000_record_subscription_change_payments.sql`・webhook `invoice.paid`・`features/subscription/lib/subscription-change-payment.ts`）。2026-10-26 ユーザー決定: 案A・ペルコインの履歴には出さない。2026-10-30 ユーザー「売上として記録するように直してください」
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

### 前提（リポジトリの決まり）

- `credit_transactions.transaction_type` を増やすと、CHECK・管理画面の集計・通知のマッピング・履歴の表示まで影響が広がる。そのため、内訳は metadata で見る（`supabase/migrations/20260813100000_*.sql` の注記）。
- `stripe_payment_intent_id` には、表全体で一意の索引がある（`idx_credit_transactions_stripe_payment_intent_id`）。プランを上げたときの付与は、もう請求の ID をここに書いている。なので、同じ請求の ID で2行目を入れることはできない。
- 処理の途中で落ちたら、支払いの記録が永遠に残らない作りは避ける。Stripe の webhook は、失敗したら Stripe が送り直す。

### 案A（おすすめ）: webhook で、量0の `subscription` の行として支払いを記録する

- **記録する所: webhook の `invoice.paid`**
  - 今は、プラン変更の日割りの請求（`subscription_update` で日割りの行があるもの）を「付与済み」として何もしない（`shouldHandleSubscriptionInvoicePaid`）。
  - このときに、**付与はせずに、支払いだけを記録する**ように分ける。付与は今までどおり `change-service.ts` が行う。
  - webhook なので、途中で落ちても Stripe が送り直す。
- **新しい RPC `record_subscription_payment(p_user_id, p_invoice_id, p_metadata)`**
  - `transaction_type = 'subscription'`・`amount = 0` の行を1つ入れる。ペルコインは動かない。種類は増やさない（CHECK は変えない）。
  - `stripe_payment_intent_id` には `payment:<請求 ID>` を入れる。付与の行（請求 ID そのもの）とぶつからず、同じ請求の2回目は今の一意の索引で止まる（送り直しが来ても1行だけ）。
  - metadata: `plan`・`billingInterval`・`revenueYen`（`invoice.amount_paid`）・`revenueSource: "stripe_subscription_change"`・`mode`（`isStripeTestMode()`）・`paymentOnly: true`・`invoiceId`。
  - service_role だけが呼べる（`FROM PUBLIC, anon, authenticated`）。
- **売上の決まりは、そのままで数えられる**
  - `isRevenueTransaction` は「本番の subscription で `revenueYen` がある」ものを数える。なので、この行は直さずに売上に入る。
  - 概要の SQL（`get_growth_active_users`・`get_percoin_daily_flow`）も同じ決まりなので、課金した人に入る。量が0なので、「買った量」は増えない（正しい）。
- **月額 → 年額**
  - 年額の請求も `subscription_update` の請求なので、同じ所で記録される。付与が0でも、支払いは残る。

### 直す・確かめる所（漏れやすい所）

| 所 | 中身 |
|---|---|
| `app/api/stripe/webhook/route.ts` | 日割りの請求のとき、`record_subscription_payment` を呼ぶ |
| 新しい RPC（マイグレーション） | 上のとおり |
| 量0の `subscription` の行が増えて困る所 | ペルコインの履歴の表示（`PercoinTransactions.tsx` など）では、`paymentOnly` の行を出さない（4章で決定）。通知のマッピング、`credit_transactions` への挿入で動くトリガー（残高・付与の束）が、量0の行で何もしないことを確かめる |
| 管理画面 | 概要の `fetchPayments`（`get-growth-overview.ts` の `.in("transaction_type", ["purchase","subscription"])`）は、種類が同じなので直さなくてよい。今までのカードの売上（`get-admin-dashboard-data.ts`）も同じ |
| テスト | webhook の分かれ道（日割りの請求なら支払いだけを記録・それ以外は今のまま）、RPC の重複（同じ請求で2回呼んでも1行）、売上に入ること |

### 案B: `change-service.ts` で、付与の行に金額を書く

- 変更が小さい（コードだけ）。
- ただし、月額 → 年額のように付与が0だと、行が作られないので拾えない。途中で落ちたときに記録が残らない。

### 案C: 売上を Stripe から直接読む

- Stripe が正しい記録なので、抜けがない。
- ただし、集計のたびに外の API を呼ぶことになり、テストと本番の切り替えや内部アカウントの除外も別に作る必要がある。今の規模では大きすぎる。

## 3. おすすめ

**案A。** 付与が0の場合も拾えて、途中で落ちても Stripe の送り直しで記録されるため。種類を増やさないので、影響が広がる範囲も小さい。

- 必要なもの: マイグレーション1本（RPC だけ。CHECK は変えない）、webhook の分かれ道、履歴の表示、テスト。
- マイグレーションは、SQL を見せて承認をもらってから適用する。
- 過去の分を埋め直す必要はない（本番では、まだ起きていないため）。

## 4. 決まったこと（2026-10-26）

1. **案A で進める。**
2. **ペルコインの履歴には、プラン変更の支払い（量0・`paymentOnly`）を出さない。** 履歴はペルコインの増減の一覧なので。
