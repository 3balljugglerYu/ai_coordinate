# 無償ペルコイン月単位失効 - 手動マイグレーション手順

Supabase Dashboard の **SQL Editor** で、以下の 5 つの SQL を**順番に**実行してください。

---

## 実行順序

1. 20260225100000_add_free_percoin_batches.sql
2. 20260225100001_update_grant_functions_for_free_percoin_batches.sql
3. 20260225100002_add_deduct_refund_percoins_and_update_apply.sql
4. 20260225100003_add_expire_free_percoin_batches.sql
5. 20260225100004_add_free_percoin_ux_rpcs.sql

---

## 6. マイグレーション履歴の登録（任意）

5 つの SQL をすべて実行した後、将来 `supabase db push` で二重実行を防ぐため、マイグレーション履歴に登録できます。

Supabase のマイグレーション履歴テーブルは `supabase_migrations.schema_migrations` です。
テーブル構造を確認してから、以下のいずれかを実行してください。

```sql
-- 構造が (version) のみの場合
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES
  ('20260225100000'),
  ('20260225100001'),
  ('20260225100002'),
  ('20260225100003'),
  ('20260225100004')
ON CONFLICT (version) DO NOTHING;
```

※ 登録しなくても、今回の SQL 実行によるスキーマ変更は有効です。登録は将来の `db push` との整合性のためです。

---

## 注意事項

- **1 つずつ実行**し、エラーが出ないことを確認してから次に進んでください
- エラーが出た場合は、その時点で停止し、内容を確認してください
- 1 番目のマイグレーションは `user_credits.promo_balance` が存在することを前提としています
