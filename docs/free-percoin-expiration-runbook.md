# 無償ペルコイン月次失効バッチ 運用 Runbook

## 概要

無償ペルコインは付与月 + 6ヶ月後の月末（JST）で失効する。`expire_free_percoin_batches` 関数が月次で失効対象バッチを処理する。

- **自動実行**: pg_cron により毎月1日 JST 09:05（UTC 00:05）に実行
- **冪等性**: 二重実行しても二重減算は発生しない

---

## 手動再実行

pg_cron 実行失敗・障害時に備え、以下の SQL で手動再実行可能。

```sql
SELECT public.expire_free_percoin_batches();
```

---

## 実行前の確認

1. **直近実行履歴の確認**
   - `free_percoin_expiration_log` の `processed_at` で直近の実行時刻を確認
   - 重複実行の心配は不要（冪等性保証のため）

2. **失効対象の事前確認（任意）**
   ```sql
   SELECT user_id, COUNT(*), SUM(remaining_amount)
   FROM free_percoin_batches
   WHERE expire_at < now() AND remaining_amount > 0
   GROUP BY user_id;
   ```

---

## 冪等性の説明

- `free_percoin_expiration_log` に `batch_id` の UNIQUE 制約があり、同一バッチの二重記録を防止
- ログに既に存在するバッチは `NOT EXISTS` で除外され、減算・削除対象にならない
- 途中失敗後の再実行時も、log に既に存在するバッチを基準に UPDATE/DELETE が行われるため、二重減算は発生しない

---

## cron 失敗検知

- **Supabase Logs**: Dashboard > Logs で pg_cron の実行ログを確認
- **Alerts**: Supabase のアラート設定で cron ジョブ失敗を検知可能
- **定期確認**: 毎月2日頃に `free_percoin_expiration_log` の `processed_at` で実行有無を確認

---

## 関連リソース

- マイグレーション: `supabase/migrations/20260225100003_add_expire_free_percoin_batches.sql`
- 計画: 無償ペルコイン月単位失効ロジック 実装計画
