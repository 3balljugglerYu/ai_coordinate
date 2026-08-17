-- 企画(コレクション)単位の訪問数・ゲストUUを取れるようにする。
--
-- 背景1: visit が企画に紐づかない
--   visit は style_id を null 固定で記録している(StylePageClient)。
--   一方 KPI 側は `.in("style_id", presetIds)` で絞るため、
--   **visit 行は1件もヒットせず、admin の「訪問(ログイン)」「訪問(ゲスト)」は
--   構造的に常に 0 を表示していた**(カードは存在するのに数字が出ない)。
--   イタリア旅行・神コレで訪問が取れなかったのはこれが原因。
--
-- 背景2: ゲストに識別子が無い
--   auth_state='guest' というラベルだけで、同一人物の判定ができない。
--   ゲストのユニーク数が算出できず、「お試し→登録」の分母が作れなかった。
--
-- 対処: 2列を足す。
--   category_key  企画単位の集計キー。style_id(preset UUID)とは別に持つ。
--                 mount_shared だけが style_id に categoryKey を入れる運用回避を
--                 していたが、意味が2種類混在して集計側の分岐が増えていた。
--                 今後は category_key を正本にする(style_id は後方互換で残す)。
--   viewer_key    `u:<user_id>` / `g:<ip_hash>`。post_impressions・home_view_events
--                 と同じ形式。サーバー側でのみ解決し、body からは受け取らない。
--
-- どちらも NULL 許容。既存行は埋めない(遡って復元できないため)。
-- 集計側は「NULL は数えない」で扱う。

BEGIN;

ALTER TABLE public.style_usage_events
  ADD COLUMN IF NOT EXISTS category_key text NULL,
  ADD COLUMN IF NOT EXISTS viewer_key text NULL;

COMMENT ON COLUMN public.style_usage_events.category_key IS
  '企画(preset_categories.key)単位の集計キー。style_id とは独立。企画に属さないイベントは NULL。';
COMMENT ON COLUMN public.style_usage_events.viewer_key IS
  'ユニーク視聴者キー。認証は u:<user_id> / ゲストは g:<ip_hash>。サーバー側でのみ解決する。IP が取れないゲストは NULL(=UUに数えない)。';

-- 書式を縛る。category_key は preset_categories.key と同じ形(admin API の KEY_PATTERN と一致)。
ALTER TABLE public.style_usage_events
  DROP CONSTRAINT IF EXISTS style_usage_events_category_key_format_check;
ALTER TABLE public.style_usage_events
  ADD CONSTRAINT style_usage_events_category_key_format_check
  CHECK (category_key IS NULL OR category_key ~ '^[a-z][a-z0-9_]{1,49}$');

-- viewer_key は長さだけ縛る(record_post_impressions と同じ 128 上限)。
ALTER TABLE public.style_usage_events
  DROP CONSTRAINT IF EXISTS style_usage_events_viewer_key_length_check;
ALTER TABLE public.style_usage_events
  ADD CONSTRAINT style_usage_events_viewer_key_length_check
  CHECK (viewer_key IS NULL OR (length(viewer_key) BETWEEN 3 AND 128));

-- KPI は「企画 × 期間 × イベント種別」で引く。style_id 単独の索引が無く
-- `.in("style_id", presetIds)` が広く走っていたため、企画別の索引を用意する。
CREATE INDEX IF NOT EXISTS idx_style_usage_events_category_event_created
  ON public.style_usage_events (category_key, event_type, created_at DESC)
  WHERE category_key IS NOT NULL;

-- ユニーク視聴者の集計用。
CREATE INDEX IF NOT EXISTS idx_style_usage_events_viewer_created
  ON public.style_usage_events (viewer_key, created_at DESC)
  WHERE viewer_key IS NOT NULL;

COMMIT;
