-- ホームの表示形式(グリッド / フィード)の効果測定
-- (計画書: docs/planning/home-feed-view-implementation-plan.md ADR-003 / ADR-006)
--
-- GA4 は導入しない。知りたいのは「フィードはプロンプト利用に繋がるか」であり、
-- 期間をまたぐ集計は SQL の方が正確に出せる。
--
-- 書き込みは必ずサーバー経由にする(RLS 全拒否)。クライアントから直接 INSERT
-- できると user_id の偽装・存在しない post_id の混入・イベント水増しの防御を
-- RLS と CHECK だけで担うことになり、KPI が汚れて既定切り替えの判断を誤る。
-- 既存の style_usage_events / post_impressions と同じ作法に揃える。

CREATE TABLE public.home_view_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 未ログインでもホームは見られるため nullable
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- 認証 u:<user_id> / ゲスト g:<ip_hash>。post_impressions と同じ形式
  viewer_key text NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN (
      'home_viewed',        -- 分母。セッション単位で1回(ADR-006)
      'view_mode_changed',  -- 切替・維持・復帰の分析用
      'prompt_use_tapped',  -- 分子。カード上・詳細画面のどちらで押されても記録する
      'follow_from_card'
    )
  ),
  -- そのイベント時点の表示形式。prompt_use_tapped / follow_from_card は
  -- 「直前のホーム表示形式」で、ホームを経ていない流入(共有リンク・プロフィール・
  -- 通知・検索)は 'none'。'none' をグリッドに数えると、分母(home_viewed)に
  -- 対応しないタップが分子に混ざってグリッドの到達率だけが水増しされる。
  view_mode text NOT NULL CHECK (
    view_mode IN ('grid', 'feed')
    OR (
      view_mode = 'none'
      AND event_type IN ('prompt_use_tapped', 'follow_from_card')
    )
  ),
  -- view_mode_changed のときの遷移元
  from_view_mode text CHECK (from_view_mode IN ('grid', 'feed')),
  -- 対象投稿。home_viewed / view_mode_changed では NULL
  post_id uuid REFERENCES public.generated_images(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 集計は「期間 × イベント種別 × 表示形式」で引く
CREATE INDEX idx_home_view_events_type_created
  ON public.home_view_events (event_type, created_at DESC);

-- 「切り替えた人が維持しているか」を見るために視聴者単位でも引く
CREATE INDEX idx_home_view_events_viewer_created
  ON public.home_view_events (viewer_key, created_at DESC);

ALTER TABLE public.home_view_events ENABLE ROW LEVEL SECURITY;

-- ポリシーを1つも作らない = service role 以外は読み書きできない。
-- 明示的に全拒否ポリシーを置いて、意図であることをスキーマ上でも示す。
CREATE POLICY home_view_events_no_public_access
  ON public.home_view_events
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.home_view_events IS
  'ホーム表示形式(グリッド/フィード)の効果測定イベント。公開SELECT/INSERT禁止(service role専用・API が viewer_key をサーバー側で解決して書く)';
COMMENT ON COLUMN public.home_view_events.view_mode IS
  'イベント時点の表示形式。prompt_use_tapped は詳細画面経由でも「直前のホーム表示形式」で帰属させる。ホーム未経由は none で、到達率の算出からは除外する(ADR-006)';
