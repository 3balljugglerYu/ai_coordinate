# Preview 環境セットアップ手順

- 最終更新日: `2026-04-08`
- 想定読者: Persta.AI の Preview / staging 検証を担当する開発者
- 役割: Vercel Preview、Stripe test、Supabase staging を使った検証手順の runbook

## 目的

本手順書は、Persta.AI の課金・サブスクリプション・Webhook を **本番に影響させずに** 検証するための最短手順をまとめる。

## 前提

- Vercel は Pro 以上
- Stripe は `test mode` を利用する
- Supabase は preview 用 branch ではなく、固定の staging project を 1 つ持つ
- 本番 URL ではなく Preview URL か固定 staging URL で検証する

短期の subscription renewal 検証だけをしたい場合は、固定 staging project ではなく
`docs/development/subscription-renewal-branching-runbook.ja.md`
の手順を使って Supabase Branching を選んでよい。

## 構成

| 要素 | 使用先 |
|---|---|
| アプリ | Vercel Preview Deployment |
| 課金 | Stripe test mode |
| DB | Supabase staging project |
| ローカル確認 | `localhost:3000` + `.env.local` |

## Step 1. Supabase staging project を準備する

1. staging 用の Supabase project を 1 つ用意する。
2. production と同じ migration を適用する。
3. 必要な seed データを入れる。
4. staging 用の値を控える。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Step 2. Vercel Preview 環境変数を設定する

Vercel Project Settings の `Environment Variables` で、少なくとも Preview に以下を設定する。

### 必須

- `NEXT_PUBLIC_SUPABASE_URL` = staging 用
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = staging 用
- `SUPABASE_SERVICE_ROLE_KEY` = staging 用
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_test_...`
- `STRIPE_SECRET_KEY` = `sk_test_...`
- `STRIPE_SECRET_KEY_TEST` = `sk_test_...`

### 推奨

- `STRIPE_WEBHOOK_SECRET_TEST` = test endpoint の `whsec_...`
- `NEXT_PUBLIC_SITE_URL` = 検証用 URL

## Step 3. Stripe test mode の product / price を揃える

Stripe Dashboard の `test mode` で以下を確認する。

- `light / standard / premium`
- `month / year`
- lookup key が正しい

例:

- `persta_subscription_light_monthly`
- `persta_subscription_light_yearly`
- `persta_subscription_standard_monthly`
- `persta_subscription_standard_yearly`
- `persta_subscription_premium_monthly`
- `persta_subscription_premium_yearly`

## Step 4. Preview URL を作る

1. 検証用 branch を push する。
2. Vercel の Preview Deployment を待つ。
3. 生成された Preview URL を控える。

例:

- `https://feature-subscription-fix-persta-ai.vercel.app`

## Step 5. Stripe webhook の送信先を Preview URL に向ける

Stripe Dashboard の `test mode` で webhook endpoint を開き、送信先を次にする。

```text
https://<preview-url>/api/stripe/webhook
```

### 注意

- `persta.ai` のような bare domain ではなく、最終到達 URL を入れる
- redirect を挟まない
- endpoint の signing secret を控える
- その値を Vercel Preview の `STRIPE_WEBHOOK_SECRET_TEST` に入れる
- 可能なら deployment 固有 URL ではなく branch alias / 固定 staging URL を使う
- Vercel Deployment Protection が有効なら、endpoint URL を次にする

```text
https://<preview-url>/api/stripe/webhook?x-vercel-protection-bypass=<bypass-secret>
```

- bypass secret を新規作成または再生成したら、Vercel Preview を再デプロイする

## Step 6. Preview で動作確認する

優先順は以下。

1. 新規加入
2. 同 interval のアップグレード
3. 同 interval のダウングレード予約
4. `monthly <-> yearly` の予約
5. Billing Portal の解約と取消し

確認項目:

- UI の current plan / badge
- Stripe Workbench の event delivery
- Supabase の `user_subscriptions`
- `profiles.subscription_plan`
- `credit_transactions`
- `free_percoin_batches`

## Step 7. Stripe Test Clock / Simulation を使う

長い請求周期の確認は、Preview で作った Stripe subscription に対して `Run simulation` を使う。

見るもの:

- `customer.subscription.updated`
- `invoice.created`
- `invoice.paid`

DB では次を確認する。

- `current_period_start`
- `current_period_end`
- `scheduled_*`
- `last_percoin_grant_at`
- `next_percoin_grant_at`

## Step 8. ローカルで webhook を見たい場合

ローカルだけで webhook を追いたい場合は Stripe CLI を使う。

```bash
npm run dev
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

この場合の `whsec_...` は `.env.local` の `STRIPE_WEBHOOK_SECRET` に入れる。

## 失敗時の切り分け

### `308 Permanent Redirect`

原因:

- webhook URL が redirect している

対策:

- Stripe endpoint URL を最終到達 URL に修正する

### `Invalid signature`

原因:

- Stripe endpoint の signing secret と Vercel env が不一致

対策:

1. Stripe endpoint の `whsec_...` を確認する
2. Vercel の `STRIPE_WEBHOOK_SECRET_TEST` に同じ値を入れる
3. 再デプロイする
4. イベントを再送する

### `404 The deployment could not be found on Vercel.`

原因:

- Stripe endpoint URL が古い deployment 固有 URL を向いている

対策:

- branch alias または固定 staging URL の `/api/stripe/webhook` に修正する

### `401 Authentication Required`

原因:

- Vercel Deployment Protection に Stripe webhook が遮断されている

対策:

1. Vercel の Protection Bypass for Automation を作る
2. Stripe endpoint URL に `x-vercel-protection-bypass=<bypass-secret>` を付ける
3. Vercel Preview を再デプロイする
4. イベントを再送する

### test event で Stripe API 取得が失敗する

原因:

- Preview / Production の webhook が `sk_live` しか持っていない

対策:

- `STRIPE_SECRET_KEY_TEST=sk_test_...` を設定する

## 運用ルール

### 低コスト優先

- Preview は branch ごとに作る
- DB は固定 staging project を使い回す
- Stripe webhook は必要なときだけ Preview URL に合わせる

### 運用安定優先

- 固定 `staging` branch か Custom Environment を 1 つ持つ
- Stripe test webhook をその固定 URL に向ける

## 検証終了後

1. 不要な Preview Deployment は放置してよいが、branch は整理する
2. Stripe webhook の送信先を次の検証対象へ合わせて更新する
3. staging DB の検証ユーザーを必要に応じて掃除する

## 関連ドキュメント

- `docs/development/deployment-environments.ja.md`
- `docs/development/subscription-renewal-branching-runbook.ja.md`
- `docs/development/project-conventions.ja.md`
- `docs/architecture/data.ja.md`
- `docs/planning/subscription-implementation-plan.md`
