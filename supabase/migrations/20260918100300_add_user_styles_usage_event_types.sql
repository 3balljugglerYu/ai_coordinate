-- ===============================================
-- User ORIGINAL (/user-styles): 計測イベントの種別を2つ増やす
-- ===============================================
-- 計画書: docs/planning/user-original-styles-implementation-plan.md 整合性チェック#4
--
-- /style は style_usage_events の 'visit' で訪問を計測しているのに、
-- /user-styles には計測が1つも無かった。このまま出すと公開後に
-- 「この画面が効いたのか」「どのチップが使われたか」を答えられない。
-- しかも**あとから足すと初期の期間が構造的に欠け**、「0」と「未計測」が
-- 区別できなくなる（神コレのシェア数で実際に起きている）。
--
-- ⭐ 既存の 'visit' を流用しない。/style の訪問数に混ざり、過去と比較できなくなる。
-- ⭐ category_key も流用しない。企画別訪問カードに /user-styles が「企画」として現れる。
--    どのチップかは category_key に入れるが、値は all / usage / author に限る
--    （既存の style_usage_events_category_key_format_check
--     '^[a-z][a-z0-9_]{1,49}$' を満たす）。
--
-- ⭐ 測る目的は「訪問とチップ選択の把握」に限定している。
--    「ここから生成に至ったか」は測れない。prompt_usage_events の列は
--    image_job_id / origin_post_id / origin_author_id / user_id だけで、
--    入口ページも選択チップも保存されないため
--    （20260730200100_add_derived_generation_rpcs.sql:276-288）。
--    測れるようにするには生成シートと生成系 RPC に手を入れることになり、
--    この計画の「既存を変えない」方針（ADR-010）と引き換えにはしない。
--
-- 許可集合を広げるだけなので既存行はすべて通る。14,288 行・7.5 MB と小さく、
-- 張り替えの検証スキャンは一瞬で済む。取得できなければ止まるよう lock_timeout を置く。

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.style_usage_events
  DROP CONSTRAINT IF EXISTS style_usage_events_event_type_check;

ALTER TABLE public.style_usage_events
  ADD CONSTRAINT style_usage_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'visit'::text,
    'generate_attempt'::text,
    'generate'::text,
    'download'::text,
    'rate_limited'::text,
    'signup_click'::text,
    'wardrobe_save_click'::text,
    'wardrobe_save_completed'::text,
    'complete_achieved'::text,
    'mount_generated'::text,
    'mount_shared'::text,
    'lottery_entry_click'::text,
    -- ここから /user-styles（2026-09-18 追加）
    'user_styles_visit'::text,
    'user_styles_chip'::text
  ]));

COMMIT;

-- 関数を作らないので NOTIFY pgrst は不要（PostgREST のスキーマキャッシュは
-- 関数・テーブル定義の解決に使われ、CHECK 制約の内容は持たない）。

-- ===============================================
-- DOWN: 上の ARRAY から user_styles_visit / user_styles_chip を除いて張り直す。
--       先に該当行を消さないと制約違反になる:
--         DELETE FROM public.style_usage_events
--          WHERE event_type IN ('user_styles_visit', 'user_styles_chip');
-- ===============================================
