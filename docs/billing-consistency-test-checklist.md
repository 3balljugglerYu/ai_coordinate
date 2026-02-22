# Billing Consistency Test Checklist

## Scope
課金整合性改善の受け入れ確認を、`TEST-01` から `TEST-06` までの観点で実施するためのチェックリストです。

## Common Setup
1. 対象環境は `staging` を使用する。
2. 画像生成ジョブは検証用ユーザーを固定して実行する。
3. すべての検証で `job_id` を控え、`image_jobs` / `credit_transactions` / Edge Functionログを同一時系列で照合する。

## TEST-01 Retry可能失敗→再試行成功で返金なし
1. 一時的に失敗しやすい入力でジョブを実行し、1回以上の再試行を発生させる。
2. 最終状態が `image_jobs.status = 'succeeded'` であることを確認する。
3. 以下SQLで `refund` が 0 件であることを確認する。

```sql
select count(*) as refund_count
from public.credit_transactions
where transaction_type = 'refund'
  and metadata->>'job_id' = :job_id;
```

期待結果: `refund_count = 0`

## TEST-02 Retry可能失敗×上限到達で返金あり
1. 再試行可能エラーを連続で発生させ、`attempts >= 3` まで到達させる。
2. `image_jobs.status = 'failed'` を確認する。
3. 以下SQLで `consumption = 1` かつ `refund = 1` を確認する。

```sql
select
  count(*) filter (where transaction_type = 'consumption') as consumption_count,
  count(*) filter (where transaction_type = 'refund') as refund_count
from public.credit_transactions
where metadata->>'job_id' = :job_id;
```

期待結果: `consumption_count = 1` かつ `refund_count = 1`

## TEST-03 Non-retryable失敗で即最終失敗＋返金あり
1. `No images generated` を再現する入力でジョブを実行する。
2. 初回失敗で `image_jobs.status = 'failed'` になることを確認する。
3. 以下SQLで `refund = 1` を確認する。

```sql
select count(*) as refund_count
from public.credit_transactions
where transaction_type = 'refund'
  and metadata->>'job_id' = :job_id;
```

期待結果: `refund_count = 1`

## TEST-04 stale未到達は再キュー、到達は最終失敗＋返金
1. `processing` 状態ジョブを作り、stale閾値未満で worker を実行する。
2. メッセージ削除されず再処理対象として残ることを確認する。
3. stale閾値超過後に worker を実行し、`attempts` で分岐することを確認する。
4. 最終失敗確定時のみ `refund` が 1 件作成されることを確認する。

期待結果: stale未到達時は返金なし、最終失敗確定時のみ返金あり

## TEST-05 同一jobの二重消費/二重返金がDB制約で防止
以下SQLを実行して重複挿入が失敗することを確認する。

```sql
-- consumption重複検証（2回目は unique violation）
insert into public.credit_transactions (user_id, amount, transaction_type, metadata)
values (:user_id, -20, 'consumption', jsonb_build_object('job_id', :job_id));

insert into public.credit_transactions (user_id, amount, transaction_type, metadata)
values (:user_id, -20, 'consumption', jsonb_build_object('job_id', :job_id));

-- refund重複検証（2回目は unique violation）
insert into public.credit_transactions (user_id, amount, transaction_type, metadata)
values (:user_id, 20, 'refund', jsonb_build_object('job_id', :job_id));

insert into public.credit_transactions (user_id, amount, transaction_type, metadata)
values (:user_id, 20, 'refund', jsonb_build_object('job_id', :job_id));
```

期待結果: 2回目の insert が失敗する

## TEST-06 異常検知関数が anomaly を検出
1. 検証用に anomaly データ（例: `succeeded + refund`）を投入する。
2. 以下SQLで anomaly を検出できることを確認する。

```sql
select *
from public.detect_generation_billing_anomalies(now() - interval '24 hours')
order by observed_at desc;
```

3. 以下SQLで監視関数実行時に異常件数が返ることを確認する。

```sql
select public.monitor_generation_billing_anomalies(now() - interval '24 hours');
```

期待結果: anomaly 件数が 1 件以上で返る

## Acceptance Queries
受け入れ基準の最終確認に使用するクエリ:

```sql
-- 1) succeeded + refund が 0 件
select count(*) as succeeded_with_refund
from public.image_jobs j
join public.credit_transactions r
  on r.user_id = j.user_id
 and r.transaction_type = 'refund'
 and r.metadata->>'job_id' = j.id::text
where j.status = 'succeeded';

-- 2) failed + consumption なのに refund がない件数
select count(*) as failed_missing_refund
from public.image_jobs j
join public.credit_transactions c
  on c.user_id = j.user_id
 and c.transaction_type = 'consumption'
 and c.metadata->>'job_id' = j.id::text
left join public.credit_transactions r
  on r.user_id = j.user_id
 and r.transaction_type = 'refund'
 and r.metadata->>'job_id' = j.id::text
where j.status = 'failed'
  and r.id is null;
```
