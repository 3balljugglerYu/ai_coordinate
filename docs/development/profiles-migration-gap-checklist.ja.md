# `profiles` 周辺 migration 補完チェックリスト

- 最終更新日: `2026-04-04`
- 想定読者: Supabase Branching や clean 環境で migration replay が失敗し、`public.profiles` などの前提 schema が不足している開発者
- 役割: production にだけ存在していて migration に落ちていない schema を、前向き migration で補完するためのチェックリスト

## このチェックリストを使う場面

次のようなエラーが出た時に使う。

```text
ERROR: relation "public.profiles" does not exist
ERROR: relation "public.follows" does not exist
ERROR: duplicate key value violates unique constraint "schema_migrations_pkey"
ERROR: insert or update on table "admin_users" violates foreign key constraint "admin_users_user_id_fkey"
```

典型的には、次の状態で起きる。

- Dashboard で手作業作成した table / function / trigger がある
- production では動いている
- しかし `supabase/migrations/*.sql` だけでは clean 環境を再現できない

## 先に決めること

- **過去 migration は書き換えない**
- **不足分を埋める新しい migration を追加する**
- **branch が壊れている場合は、修正後に削除して作り直す**

この方針にすると、既存 production 履歴を壊しにくい。

## Step 1. production を正本として schema を確認する

まず、現在の production project に実在する `profiles` 周辺を確認する。

### 最低限確認する対象

- `public.profiles`
- `public.handle_new_user()`
- `auth.users` 作成時に呼ばれる trigger
- `public.user_credits`
- `public.credit_transactions`
- `public.free_percoin_batches`
- `public.notifications`

### `profiles` で確認する項目

- table が存在するか
- 主キー
- 外部キー
- unique 制約
- check 制約
- index
- RLS 有効化
- policy
- trigger

### `profiles` の主要カラム

この repo の台帳上、最低限ここまでは存在する前提になっている。

- `id`
- `user_id`
- `nickname`
- `bio`
- `avatar_url`
- `website_url`
- `subscription_plan`
- `last_daily_post_bonus_at`
- `last_streak_login_at`
- `streak_days`
- `referral_code`
- `last_coordinate_toast_ack_at`
- `deactivation_requested_at`
- `deletion_scheduled_at`
- `deactivated_at`
- `reactivated_at`
- `created_at`
- `updated_at`

参照:
- [.cursor/rules/database-design.mdc](/Users/hide/ai_coordinate/.cursor/rules/database-design.mdc)
- [docs/architecture/data.ja.md](/Users/hide/ai_coordinate/docs/architecture/data.ja.md)

## Step 2. repo の migration と突き合わせる

次に、repo 側で `profiles` をどこから前提にしているかを見る。

### まず見るファイル

- [20250109000001_initial_setup.sql](/Users/hide/ai_coordinate/supabase/migrations/20250109000001_initial_setup.sql)
- [20250123140000_add_generation_types_and_stock_images.sql](/Users/hide/ai_coordinate/supabase/migrations/20250123140000_add_generation_types_and_stock_images.sql)
- [20250123140001_add_functions_and_triggers.sql](/Users/hide/ai_coordinate/supabase/migrations/20250123140001_add_functions_and_triggers.sql)
- [20250124000000_add_get_follow_counts_function.sql](/Users/hide/ai_coordinate/supabase/migrations/20250124000000_add_get_follow_counts_function.sql)

### この段階で洗い出すこと

- `CREATE TABLE public.profiles` が migration にあるか
- `handle_new_user()` が migration にあるか
- `auth.users` trigger が migration にあるか
- `profiles` に対する RLS / policy が migration にあるか
- `profiles.subscription_plan` の追加より前に `profiles` 本体が作られているか
- `public.follows` を参照する関数より前に `follows` 本体が作られているか

## Step 3. 不足分一覧を作る

以下のような形で、**production にはあるが migration に無いもの** を列挙する。

### 例

- `public.profiles` table 本体
- `public.follows` table 本体
- `profiles_user_id_key`
- `profiles_referral_code_key`
- `profiles_subscription_plan_check`
- `profiles` の RLS policy
- `public.handle_new_user()`
- `on_auth_user_created` trigger
- `public.generate_referral_code()`

この一覧が、新しい補完 migration の作業単位になる。

## Step 4. 新しい補完 migration を作る

ここで **新しい timestamp の migration ファイル** を作る。

例:

```bash
supabase migration new backfill_missing_profiles_schema
```

今回のように、**既存 migration が途中で `relation does not exist` で止まっている場合は、失敗している migration より前の時刻に差し込む**。
例:

- `20250124000000_add_get_follow_counts_function.sql` が `public.follows` 不足で失敗している
- この場合は `20250123235959_create_follows_table.sql` のように、**参照関数より前**へ補完 migration を置く

### 書き方の原則

- `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `CREATE OR REPLACE FUNCTION`
- `DROP TRIGGER IF EXISTS ...`
- `CREATE TRIGGER ...`

### 重要

- 既存 production に当たっても壊れないよう、**冪等的** に書く
- 古い migration を修正してはいけない
- 補完 migration は **「不足を埋める」** ことに限定する

## Step 5. `profiles` だけでなく初期化チェーンも補う

`profiles` があるだけでは足りない場合がある。特に新規ユーザー作成や bonus 付与を伴う検証では、次も必要になる。

- `handle_new_user()` が `profiles` を insert できること
- `user_credits` 初期化
- `credit_transactions` 初期 bonus 記録
- `free_percoin_batches` 初期 batch 作成
- `notifications` 初期通知作成

renewal 検証だけなら signup bonus まで厳密に不要な場合もあるが、**検証用ユーザー作成を branch 側で自然に行いたいなら、初期化チェーンも整っている方が安全**。

## Step 6. clean 環境で migration replay を確認する

補完 migration を書いたら、**最初から replay できるか** を確認する。

### 推奨順

1. ローカルで `supabase db reset`
2. もしくは壊れた preview branch を削除
3. branch を再作成

確認したいこと:

- migration が最後まで通る
- `public.profiles` が存在する
- `subscription_plan` の追加 migration で落ちない

## Step 7. branch を作り直してから Preview をつなぐ

replay が通ったら、初めて branch 検証に戻る。

順番:

1. 失敗した preview branch を削除
2. 修正済み branch から新しい preview branch を作成
3. branch 用 `Project URL` と keys を取得
4. Vercel Preview env を設定
5. Stripe test webhook を Preview URL に向ける
6. renewal 検証を実施

## Step 8. それでも失敗する時の見方

### `public.profiles` はできたが別の table で落ちる

次の前提 schema も migration に欠けている。  
同じ手順で **不足一覧を追加**し、補完 migration を拡張する。

典型例:

- `public.get_follow_counts()` が `public.follows` を参照する
- しかし `follows` の `CREATE TABLE` が後ろの migration にしかない
- この場合は `follows` を前倒しで補完する migration を追加する

### `schema_migrations_pkey` の重複で落ちる

migration filename の version prefix が重複している。Supabase は filename 先頭の数字を version として `supabase_migrations.schema_migrations` に保存するため、同じ値が2本あると replay で止まる。

典型例:

- `20250124000000_add_get_follow_counts_function.sql`
- `20250124000000_fix_source_image_stocks_update_rls.sql`

この場合は、**片方の filename を未使用の version にずらす**。SQL 本文ではなく filename の version を一意にするのがポイント。

### `auth.users` 参照 seed の外部キーで落ちる

固定 UUID を seed する migration が、clean 環境ではまだ存在しない `auth.users` を前提にしているケース。

典型例:

- `public.admin_users` に固定 admin UUID を INSERT する
- しかし preview branch の `auth.users` にその行が存在しない

この場合は、seed を次の形に変える。

- `INSERT ... SELECT ... FROM auth.users WHERE id = ...`
- 監査ログから backfill する場合も `JOIN auth.users` で実在ユーザーだけに絞る

### function / trigger で落ちる

table だけでなく、依存 function や trigger も migration に無い可能性が高い。

### policy / RLS で落ちる

RLS の enable と policy 作成順が崩れている可能性がある。`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` と `CREATE POLICY` の順序を見直す。

## 完了条件

以下を満たせば、このチェックリストの目的は達成。

- clean 環境で migration replay が最後まで通る
- `public.profiles` 周辺の前提 schema が migration だけで再現できる
- Supabase preview branch を再作成しても migrate step で落ちない
- その後の Vercel Preview / Stripe renewal 検証に進める
