# Subscription Renewal 検証用 Supabase Branching 手順

- 最終更新日: `2026-04-04`
- 想定読者: Persta.AI のサブスクリプション renewal と Percoin 付与を短期検証したい開発者
- 役割: Supabase Branching を使って、更新日反映と月次付与を最短で確認するための手順書

## この手順を使う場面

この手順は、以下のような **短期の検証** に限定して使う。

- `monthly -> yearly` の予約変更が更新日に正しく適用されるか確認したい
- 更新日に `invoice.paid` が来た時、Percoin 付与が正しく入るか見たい
- `last_percoin_grant_at` / `next_percoin_grant_at` が正しく更新されるか見たい

長く使う `staging` 環境を作りたい場合は、この手順ではなく `docs/development/preview-environment-runbook.ja.md` を使う。

## 前提

- Supabase Branching が有効な plan である
- Vercel Preview Deployment が使える
- Stripe は `test mode` を使う
- 検証後に branch を削除する前提である

## Branching を使う理由

今回の目的は「本番に近い更新日イベントを 1 回確認すること」であり、常設環境は不要である。  
この用途では、固定 `staging` project を増やすより、短時間だけ branch を作って消す方が自然である。

公式ドキュメント上も、Preview branch は focused testing 向けで、data-less かつ branch ごとに独立 credentials を持つ。  
参考:

- https://supabase.com/docs/guides/deployment/branching
- https://supabase.com/docs/guides/deployment/branching/dashboard

## 最短構成

| 要素 | 使用先 |
|---|---|
| アプリ | Vercel Preview Deployment |
| 課金 | Stripe test mode |
| DB | Supabase Preview Branch |
| 更新日再現 | Stripe Test Clock / Simulation |

## Step 1. Supabase で preview branch を作る

Supabase Dashboard で production project を開き、branch を作る。

1. 画面上部の branch selector を開く
2. `Create branch` を選ぶ
3. branch 名を決める

例:

- `subscription-renewal-check`

### 補足

- branch は production の schema / config から分岐する
- branch は production の実データを自動では持たない
- branch ごとに API URL と keys が変わる

## Step 2. branch の接続情報を控える

branch を選択した状態で `Settings > API` を開き、次を控える。

- `Project URL`
- `anon` または `publishable key`
- `service_role key`

この値は production 用と別物である。

## Step 3. Vercel Preview に branch の env を入れる

検証用 branch の Vercel Preview 環境に、Supabase branch 用の値を入れる。

### 必須

- `NEXT_PUBLIC_SUPABASE_URL` = branch の URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = branch の anon / publishable key
- `SUPABASE_SERVICE_ROLE_KEY` = branch の service role key
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_test_...`
- `STRIPE_SECRET_KEY` = `sk_test_...`
- `STRIPE_SECRET_KEY_TEST` = `sk_test_...`

### 推奨

- `STRIPE_WEBHOOK_SECRET_TEST` = test webhook endpoint の `whsec_...`

## Step 4. Vercel Preview Deployment を作る

1. 検証用 Git branch を push する
2. Vercel Preview URL が作られるのを待つ
3. 対象 Preview URL を控える

例:

- `https://subscription-renewal-check-persta.vercel.app`

## Step 5. Stripe test webhook を Preview URL に向ける

Stripe Dashboard の `test mode` で webhook endpoint を開き、送信先を Preview URL にする。

```text
https://<preview-url>/api/stripe/webhook
```

### 注意

- redirect を挟まない URL にする
- endpoint の signing secret を確認し、Vercel Preview の `STRIPE_WEBHOOK_SECRET_TEST` に入れる

## Step 6. renewal 検証用ユーザーを作る

Supabase branch 側で、検証専用ユーザーを用意する。

最低限必要なのは以下。

- Auth user
- `profiles` レコード
- branch 環境でログインできる状態

## Step 7. Preview 環境で subscription を作る

1. Vercel Preview URL にアクセスする
2. Stripe test mode で月額プランへ加入する
3. その後、必要なら `monthly -> yearly` の予約変更を行う

確認項目:

- `user_subscriptions`
- `profiles.subscription_plan`
- `credit_transactions`
- `free_percoin_batches`

## Step 8. Stripe Test Clock / Simulation で更新日を再現する

Persta が実際に作った Stripe subscription 詳細画面から `Run simulation` を使う。

確認したいのは次。

- 予約変更が更新日に適用されるか
- `invoice.paid` が届くか
- 年額開始時の初回付与が入るか

進める時刻は、更新時刻ぴったりではなく **少し先** まで進める。

## Step 9. branch DB で確認する

更新後に branch DB で次を見る。

```sql
select
  user_id,
  plan,
  status,
  billing_interval,
  current_period_start,
  current_period_end,
  scheduled_plan,
  scheduled_billing_interval,
  scheduled_change_at,
  last_percoin_grant_at,
  next_percoin_grant_at
from public.user_subscriptions
where user_id = :user_id;
```

```sql
select
  amount,
  transaction_type,
  metadata,
  created_at
from public.credit_transactions
where user_id = :user_id
  and transaction_type = 'subscription'
order by created_at desc;
```

期待値:

- `scheduled_* = null`
- `plan` と `billing_interval` が予約どおりに更新
- `last_percoin_grant_at` が初回付与時刻に更新
- `next_percoin_grant_at` が次回月次付与日に更新
- `credit_transactions` に renewal / initial yearly grant が入る

## Step 10. 不要になったら branch を削除する

検証が終わったら branch を削除する。

理由:

- branch は短期検証用である
- branch を残し続けると Branching Compute が積み上がる

## 失敗時の切り分け

### Preview で DB 反映されない

確認:

- Vercel Preview の env が branch 用に切り替わっているか
- production の Supabase URL を見ていないか

### webhook が `308`

確認:

- Stripe endpoint URL が redirect していないか

### webhook が `Invalid signature`

確認:

- `STRIPE_WEBHOOK_SECRET_TEST` が Preview endpoint の secret と一致しているか

### 想定と違うデータがある

確認:

- その branch は production データを持たない
- 必要な検証データが seed されているか

## この手順のメリットと限界

### メリット

- production DB を汚さない
- staging project を常設しなくてよい
- renewal 検証だけならコストを抑えやすい

### 限界

- branch は短期向けで、毎日使う staging には向かない
- preview ごとに env と webhook の向き先を合わせる必要がある
- branch のデータは持続的な検証資産にはなりにくい

## 関連ドキュメント

- `docs/development/deployment-environments.ja.md`
- `docs/development/preview-environment-runbook.ja.md`
- `docs/architecture/data.ja.md`
- `docs/planning/subscription-implementation-plan.md`
