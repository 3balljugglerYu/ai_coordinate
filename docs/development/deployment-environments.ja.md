# デプロイ環境構成

- 最終更新日: `2026-04-04`
- 想定読者: Persta.AI のデプロイ、課金、データ環境を管理する開発者
- 役割: Vercel / Stripe / Supabase の環境分離方針に関する正本

## 目的

本ドキュメントは、Persta.AI の開発・検証・本番公開を安全に分離するための環境構成を定義する。

特に以下を防ぐことを目的とする。

- 未検証の課金変更が本番ユーザーに露出すること
- Stripe `test` と `live` の設定が混線すること
- Preview 検証のたびに Supabase Branching コストが積み上がること

## 推奨構成

| 環境 | 実体 | 主な URL | Stripe | Supabase | 用途 |
|---|---|---|---|---|---|
| Development | ローカル開発環境 | `http://localhost:3000` | `test` | staging 相当 DB かローカル接続 | 手元実装、局所テスト |
| Preview | Vercel Preview Deployment | `https://<branch>-<project>.vercel.app` | `test` | 固定 staging project | 機能検証、QA、レビュー |
| Production | Vercel Production Deployment | `https://www.persta.ai` | `live` | production project | 公開本番 |

## 環境の意味

### Development

- `.env.local` と `localhost` で動かす手元環境
- 実装中の UI と route handler の確認に使う
- Stripe webhook をローカルで見る場合は Stripe CLI を使う

### Preview

- Vercel がブランチごとに作る検証用デプロイ
- 本番ユーザーには公開しない前提で使う
- 課金検証では Stripe `test` と組み合わせる
- DB は Supabase の固定 staging project を使う

### Production

- `www.persta.ai` に紐づく公開環境
- Stripe `live`、Supabase production を使う
- 未検証の課金変更は出さない

## コスト最小の方針

Persta.AI では、Preview 用 DB として **Supabase Branching を PR ごとに作らず、固定の staging project を 1 つ持つ** ことを推奨する。

理由:

- Supabase Branching は便利だが、branch compute が別課金になる
- Branching は Spend Cap 対象外
- PR ごとに branch を作るとコストが読みにくい
- 固定 staging project の方が運用コストと mental load が低い

## 推奨トポロジ

```text
Local Development
  └─ localhost:3000
     ├─ Stripe test
     └─ Supabase staging

Preview Deployment
  └─ vercel preview URL
     ├─ Stripe test
     └─ Supabase staging

Production Deployment
  └─ www.persta.ai
     ├─ Stripe live
     └─ Supabase production
```

## 環境変数の分離方針

### Development

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`
- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...` または Stripe CLI の secret
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: staging 用
- `SUPABASE_SERVICE_ROLE_KEY`: staging 用

### Preview

Preview は `test` 用の値だけを入れる。

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`
- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_SECRET_KEY_TEST=sk_test_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...` または未設定
- `STRIPE_WEBHOOK_SECRET_TEST=whsec_...`
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: staging 用
- `SUPABASE_SERVICE_ROLE_KEY`: staging 用

### Production

Production は `live` を正本とする。

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...`
- `STRIPE_SECRET_KEY=sk_live_...`
- `STRIPE_SECRET_KEY_LIVE=sk_live_...`
- `STRIPE_WEBHOOK_SECRET=whsec_live...` または未設定
- `STRIPE_WEBHOOK_SECRET_LIVE=whsec_live...`
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: production 用
- `SUPABASE_SERVICE_ROLE_KEY`: production 用

## 例外運用

本番 URL で Stripe `test` webhook を一時的に受ける必要がある場合のみ、Production に次を追加してよい。

- `STRIPE_SECRET_KEY_TEST=sk_test_...`
- `STRIPE_WEBHOOK_SECRET_TEST=whsec_test_...`

ただしこれは移行期間用の例外であり、通常運用では **`test` webhook は Preview に向ける**。

## 短期の renewal 検証では Branching を使ってよい

固定 `staging` project は、繰り返し使う検証基盤として推奨する。  
一方で、subscription renewal のような **短期間で終わる検証** については、Supabase Branching を使ってよい。

使い分け:

- 日常的な QA / Preview 運用: 固定 `staging` project
- 一時的な renewal / migration / webhook 検証: Supabase Branching

Branching を使う具体手順は `docs/development/subscription-renewal-branching-runbook.ja.md` を参照する。

## Preview と固定 staging の使い分け

### 最小コスト運用

- Vercel Preview URL をそのまま使う
- Stripe webhook の送信先は、検証対象の Preview URL に都度合わせる

### 運用を安定させる場合

- Vercel Pro の Custom Environment または固定 branch を使い、`staging` 用の安定 URL を持つ
- Stripe test webhook の送信先をその固定 URL にする

Webhook を伴う課金検証が多い場合は、後者の方が運用ミスを減らせる。

## 禁止事項

- Production URL で未検証コードの課金導線を直接検証し続けること
- Stripe `test` と `live` の key / webhook secret を同じ環境変数に混在させること
- Preview ごとに Supabase Branching を常設し続けること

## 関連ドキュメント

- `docs/development/subscription-renewal-branching-runbook.ja.md`
- `docs/development/preview-environment-runbook.ja.md`
- `docs/development/project-conventions.ja.md`
- `docs/architecture/data.ja.md`
- `docs/planning/subscription-implementation-plan.md`
