# Billing Consistency Runbook

## Purpose
画像生成課金の整合性を維持し、以下の異常を検知するための運用手順です。

- `refund` があるのに `image_jobs.status = succeeded`
- `consumption` があるのに最終 `failed` で `refund` がない
- `succeeded` なのに `consumption` がない

この運用は **検知のみ** です。自動金額是正は行いません。

## Pre-Deploy Checklist

1. 事前重複確認（部分一意インデックス追加前）

```sql
with tx as (
  select
    transaction_type,
    user_id,
    metadata->>'job_id' as job_id,
    count(*) as cnt,
    array_agg(id order by created_at) as tx_ids
  from public.credit_transactions
  where transaction_type in ('consumption', 'refund')
    and metadata ? 'job_id'
  group by transaction_type, user_id, metadata->>'job_id'
)
select *
from tx
where cnt > 1
order by cnt desc, transaction_type, user_id;
```

2. 本番バックアップ（スナップショット）取得
- 推奨タイミング: マイグレーション適用の直前（5分以内）
- 取得対象: DB schema + data

## Monitoring

1. 異常検知関数（2時間窓）

```sql
select *
from public.detect_generation_billing_anomalies(now() - interval '2 hours')
order by observed_at desc;
```

2. 監視実行関数（異常がある場合のみ `admin_audit_log` 記録）

```sql
select public.monitor_generation_billing_anomalies(now() - interval '2 hours');
```

3. 定期実行
- pg_cron job name: `generation_billing_anomaly_monitor_hourly`
- schedule: `7 * * * *`

## Test Checklist

詳細な検証手順は `docs/billing-consistency-test-checklist.md` を参照してください。

## Triage Procedure

1. 対象 `job_id` のジョブ状態確認

```sql
select id, user_id, status, attempts, error_message, created_at, started_at, completed_at, updated_at
from public.image_jobs
where id = :job_id;
```

2. 対象 `job_id` の課金履歴確認

```sql
select id, user_id, amount, transaction_type, related_generation_id, metadata, created_at
from public.credit_transactions
where metadata->>'job_id' = :job_id
order by created_at;
```

3. 生成結果確認

```sql
select id, user_id, image_url, storage_path, created_at
from public.generated_images
where id = :related_generation_id;
```

4. Storageログ/Edge Functionログを時系列で照合
- 失敗→再試行→成功の流れを確認
- 返金発生時刻と `job.status` 変遷を確認

## Operational Policy

1. 自動是正は行わない（検知のみ）。
2. 是正が必要な場合は、運用承認後に手動で調整取引を実施する。
3. 手動調整時は `admin_audit_log` に根拠（job_id, tx_id, reason）を残す。

## Post-Deploy Validation

1. `succeeded + refund` の同時成立が新規データで 0 件。
2. `failed` 最終確定ジョブで `consumption` がある場合、`refund` が 1 件。
3. retry途中で返金ログが発生しない。
4. 監視ジョブが1時間ごとに実行され、異常時のみ監査ログに記録される。
