-- ===============================================
-- style_usage_events.event_type にコレクション系イベントを追加
-- ===============================================
-- 計測(KPI)のため event_type に以下 3 値を追加する:
--   - complete_achieved : コンプリート達成(server 発火)
--   - mount_generated   : 台紙生成(server 発火)
--   - mount_shared      : 台紙シェア(公開ページURLのシェア時に client 発火)
--
-- 既存 CHECK 制約に許可値を追加するだけの後方互換変更(既存 row へ影響なし)。
-- DROP は IF EXISTS で冪等にし、ADD で全許可値を再定義する。
-- (手本: 20260606120000_add_wardrobe_usage_event_types.sql)
-- ===============================================

ALTER TABLE public.style_usage_events
  DROP CONSTRAINT IF EXISTS style_usage_events_event_type_check;

ALTER TABLE public.style_usage_events
  ADD CONSTRAINT style_usage_events_event_type_check
  CHECK (
    event_type = ANY (
      ARRAY[
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
        'mount_shared'::text
      ]
    )
  );

-- ===============================================
-- DOWN:
-- ALTER TABLE public.style_usage_events
--   DROP CONSTRAINT IF EXISTS style_usage_events_event_type_check;
-- ALTER TABLE public.style_usage_events
--   ADD CONSTRAINT style_usage_events_event_type_check
--   CHECK (event_type = ANY (ARRAY[
--     'visit','generate_attempt','generate','download','rate_limited',
--     'signup_click','wardrobe_save_click','wardrobe_save_completed']::text[]));
-- ===============================================
