# 投稿の編集で並び順を変えない（posted_at を書き換えない）

作成日: 2026-09-27
状態: **未着手**（方針は決定済み。実施は別セッション）
関連: `app/api/posts/update/route.ts` / `features/generation/lib/server-database.ts` / `features/posts/lib/server-api.ts`

## 起きていること

ホームに投稿した作品の説明を編集して保存するだけで、その作品が「新着」の一番上に上がる。

## 決まったこと（2026-09-27、変更しない）

| 項目 | 決定 |
|---|---|
| 編集で並び順を変えるか | **変えない**。コードを直して、これ以上ずれないようにする |
| すでに書き換わった投稿日時 | **元に戻す**（2026-09-27 時点で検出できたのは 41件・9人） |
| 本番データの書き換え | 実行前に対象の一覧をユーザーに見せ、了承を得てから行う |

## 原因（2026-09-27 に main `e251aeb` で確認）

- **書く側**: 編集の保存 `PUT /api/posts/update`（`app/api/posts/update/route.ts:44`）が、新規投稿と同じ
  `postImageServer`（`features/generation/lib/server-database.ts:122`）を呼んでいる。この関数は呼ばれるたびに
  `is_posted: true`（`:131`）と `posted_at: new Date().toISOString()`（`:133`）を書く
- **読む側**: ホームの新着は `posted_at` の新しい順（`features/posts/lib/server-api.ts:802`）
- 画面側の「投稿直後に先頭へ差し込む」処理は、新規投稿のときだけ動く（`features/posts/components/PostModal.tsx:195`
  の `action: "posted"` → `features/posts/components/PostList.tsx` の `justPostedCard`）。今回の原因ではない

### 同じ原因で起きていること

- 作品カードの「◯分前」が編集した時刻になる（`features/posts/components/PostFeedCard.tsx:163`）
- PICK UP!! の🆕枠（直近24時間の `posted_at` から選ぶ: `supabase/migrations/20260916110000_stratify_popular_prompts_new_slots.sql:214`）に、
  編集しただけの古い投稿が入れる
- 昨日・先週・先月の期間別一覧で、本来の期間から外れる
- マイページの投稿一覧の並びが変わる
- 編集 API で**未投稿の画像を公開できてしまう**（`is_posted: true` を書くため。ボーナスは付かない）

### 影響しないもの

- 投稿ボーナス: 付与は `POST /api/posts/post` のときだけで、判定に `posted_at` を使わない
- アプリ（persta-app）: 同じ `PUT /api/posts/update` を使う（`lib/domain/repository/post_creation_api.dart:8`）ので、
  サーバーを直せばアプリの修正は要らない。ただし、アプリが応答の `posted_at` で並べ替えていないかは実装時に確かめる

## 直し方

- 編集専用のサーバー関数を分ける。更新するのは `caption` / `show_before_image` / `prompt_visibility` だけにして、
  `posted_at` と `is_posted` には触れない
- 対象は投稿済みに限る（`.eq("is_posted", true)`）。未投稿なら 0 行になるので、エラーを返す
- 次は今までどおり残す
  - ハッシュタグの洗い替え（`app/api/posts/update/route.ts:52`）
  - キャッシュの無効化（`revalidateTag("home-posts")` など `:61` 以降）
  - `prompt_visibility=private` を DB トリガーが拒否したときのエラー処理
- 新規投稿（`POST /api/posts/post`）の動きは変えない。`posted_at` を今にするのは新規投稿だけ
- マイグレーションは不要の見込み

### テスト観点（テストを先に書く）

| 種類 | 観点 |
|---|---|
| 正常 | 編集しても `posted_at` が変わらない。説明・Before 表示・公開設定は変わる |
| 正常 | 新規投稿は今までどおり `posted_at` を今にする |
| 異常 | 未投稿の画像は、編集 API では公開されない |
| 異常 | 非公開にできない投稿を非公開にしようとしたときのエラーは今までどおり |

検証コマンド: `npm run lint` / `npm run typecheck` / `npm run test` / `npm run build -- --webpack`
（lint と typecheck には main 時点の既存エラーがあるので、main と件数を比べて増やさない）

## 41件を元に戻す手順

> ⚠️ **本番データベースへの接続が要る。** 次のどれかで行う。
>
> - **クラウドのセッション**: 環境の **API credentials** に Supabase のアクセストークン
>   （Allowed websites = `api.supabase.com`、ヘッダー `Authorization` / Prefix `Bearer`）が登録されていれば、
>   Supabase Management API の SQL の窓口（`POST /v1/projects/{ref}/database/query`、ベータ）を curl で呼ぶ。
>   トークンはエージェントのプロキシが付けるので、セッションからは見えない。読み取りには `"read_only": true` を付ける
>   ```sh
>   curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
>     -H "Content-Type: application/json" \
>     -d '{"query": "select 1", "read_only": true}'
>   ```
>   `SUPABASE_PROJECT_REF`（本番は `hnrccaxrvhtbuihfvitc`。`NEXT_PUBLIC_SUPABASE_URL` のサブドメインで、秘密ではない）は
>   環境変数に置く。Supabase CLI のデータベース操作（`supabase db query` など）は直接つなぐ方式で、
>   クラウドの HTTP/HTTPS の中継を通れない見込みなので使わない
> - **手元のセッション**: `supabase db query --linked`
> - **Supabase の管理画面の SQL エディタ**

1. **コードの修正を本番に出してから**戻す。先に戻すと、また編集で上がる
2. 数え直す。元の投稿時刻は、デイリー投稿ボーナスの記録にだけ残っている
   ```sql
   with b as (
     select distinct on (ct.related_generation_id)
            ct.related_generation_id as id,
            (ct.metadata->>'posted_at')::timestamptz as first_posted
     from credit_transactions ct
     where ct.transaction_type = 'daily_post'
       and ct.metadata ? 'posted_at'
       and ct.related_generation_id is not null
     order by ct.related_generation_id, ct.created_at
   )
   select gi.id, gi.user_id, gi.posted_at as current_posted_at, b.first_posted
   from b
   join generated_images gi on gi.id = b.id
   where gi.is_posted
     and gi.posted_at > b.first_posted + interval '1 minute'
   order by gi.posted_at desc;
   ```
   - 結合キーは `credit_transactions.related_generation_id`（metadata の中ではない）
   - ボーナスが付かなかった投稿は元の時刻が残っていないので、戻せない（対象外）
3. ⚠️ **「取り消し → 再投稿」した投稿が混ざる可能性がある。** 取り消し（`app/api/posts/[id]/route.ts:36` の
   `unpostImageServer` が `posted_at` を null にする）のあとに投稿し直したものは、新しい `posted_at` が正しい。
   ボーナスの記録は最初の1回分しか無いので、上の条件では編集と区別できない。
   取り消しの跡（ログ・通知・インプレッションの空白など）で見分けられるかを先に調べ、見分けられないものはユーザーに判断を仰ぐ
4. 対象の一覧（投稿ID・作者のニックネーム・今の日時・戻す日時）をユーザーに見せて了承を得る。
   内部アカウント（本人・テスト用）が含まれていれば明示する
5. 戻す前の値を保存してから、投稿 ID を列挙した1本の UPDATE で `posted_at = first_posted` に戻す（WHERE の無い更新はしない）
6. ⚠️ DB を直接直しても、Next のキャッシュ（`home-posts` などのタグ）は消えない。反映のさせ方
   （キャッシュの期限切れを待つ / 再検証を起こす）を決めてから実行する
7. 戻したあと、ホームの新着と PICK UP!! の🆕で並びを確かめて報告する
