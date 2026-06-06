-- ===============================================
-- style_usage_events.event_type に wardrobe 系イベントを追加
-- ===============================================
-- 背景:
--   ゲストが生成した着せ替えを「クローゼットに保存」する導線 (ログイン転換施策 P1) の
--   計測のため、event_type に以下 2 値を追加する:
--     - wardrobe_save_click     : ゲストが「保存」CTA を押下 (client 発火)
--     - wardrobe_save_completed : ログイン後に claim が成功し保存完了 (server 発火)
--
-- 設計判断:
--   - 既存 CHECK 制約に許可値を追加するだけの後方互換変更 (既存 row へ影響なし)。
--   - auth_state / release 系の他制約は一切変更しない。
--   - DROP は IF EXISTS で冪等にし、ADD で全許可値を再定義する。
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
        'wardrobe_save_completed'::text
      ]
    )
  );
