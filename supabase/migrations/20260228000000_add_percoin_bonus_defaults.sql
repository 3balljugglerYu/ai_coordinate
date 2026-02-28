-- デフォルト枚数管理: percoin_bonus_defaults, percoin_streak_defaults テーブル
-- 管理画面で変更可能。各 grant 関数がここから枚数を取得する

-- 1. percoin_bonus_defaults（単一枚数タイプ: signup_bonus, tour_bonus, referral, daily_post）
CREATE TABLE public.percoin_bonus_defaults (
  source TEXT PRIMARY KEY CHECK (source IN ('signup_bonus', 'tour_bonus', 'referral', 'daily_post')),
  amount INTEGER NOT NULL CHECK (amount >= 1 AND amount <= 1000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. percoin_streak_defaults（日数別: 1〜14日目）
CREATE TABLE public.percoin_streak_defaults (
  streak_day INTEGER PRIMARY KEY CHECK (streak_day BETWEEN 1 AND 14),
  amount INTEGER NOT NULL CHECK (amount >= 1 AND amount <= 1000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. RLS
ALTER TABLE public.percoin_bonus_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.percoin_streak_defaults ENABLE ROW LEVEL SECURITY;
-- ポリシーを付与しない＝anon/authenticated はデフォルト拒否。API は createAdminClient（service_role）でアクセス

-- 4. REVOKE（anon/authenticated から直接操作禁止）
REVOKE ALL ON public.percoin_bonus_defaults FROM anon;
REVOKE ALL ON public.percoin_streak_defaults FROM anon;
REVOKE ALL ON public.percoin_bonus_defaults FROM authenticated;
REVOKE ALL ON public.percoin_streak_defaults FROM authenticated;

-- 5. 初期データ（現行のハードコード値）
INSERT INTO public.percoin_bonus_defaults (source, amount) VALUES
  ('signup_bonus', 50),
  ('tour_bonus', 20),
  ('referral', 100),
  ('daily_post', 30)
ON CONFLICT (source) DO NOTHING;

INSERT INTO public.percoin_streak_defaults (streak_day, amount) VALUES
  (1, 10), (2, 10), (3, 20), (4, 10), (5, 10), (6, 10),
  (7, 50), (8, 10), (9, 10), (10, 10), (11, 10), (12, 10), (13, 10), (14, 100)
ON CONFLICT (streak_day) DO NOTHING;

-- 6. ヘルパー RPC: get_percoin_bonus_default
CREATE OR REPLACE FUNCTION public.get_percoin_bonus_default(p_source TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount INTEGER;
BEGIN
  SELECT amount INTO v_amount
  FROM percoin_bonus_defaults
  WHERE source = p_source;

  IF v_amount IS NULL THEN
    -- フォールバック（現行値）
    v_amount := CASE p_source
      WHEN 'signup_bonus' THEN 50
      WHEN 'tour_bonus' THEN 20
      WHEN 'referral' THEN 100
      WHEN 'daily_post' THEN 30
      ELSE 0
    END;
  END IF;

  RETURN v_amount;
END;
$$;

-- 7. ヘルパー RPC: get_percoin_streak_amount
CREATE OR REPLACE FUNCTION public.get_percoin_streak_amount(p_streak_day INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount INTEGER;
BEGIN
  SELECT amount INTO v_amount
  FROM percoin_streak_defaults
  WHERE streak_day = p_streak_day;

  IF v_amount IS NULL THEN
    -- フォールバック（現行値）
    v_amount := CASE p_streak_day
      WHEN 1 THEN 10 WHEN 2 THEN 10 WHEN 3 THEN 20 WHEN 4 THEN 10 WHEN 5 THEN 10
      WHEN 6 THEN 10 WHEN 7 THEN 50 WHEN 8 THEN 10 WHEN 9 THEN 10 WHEN 10 THEN 10
      WHEN 11 THEN 10 WHEN 12 THEN 10 WHEN 13 THEN 10 WHEN 14 THEN 100
      ELSE 0
    END;
  END IF;

  RETURN v_amount;
END;
$$;
