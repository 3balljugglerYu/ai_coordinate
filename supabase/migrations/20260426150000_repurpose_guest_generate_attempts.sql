-- 既存 `style_guest_generate_attempts` テーブルと `reserve_style_guest_generate_attempt`
-- RPC を「画面横断ゲスト生成試行（/style と /coordinate を合算）」へ意味付け変更する。
--
-- 関連: docs/planning/unify-style-coordinate-usage-limits-plan.md
--   - ADR-002: テーブル名・カラム名・RPC 名は据え置き、コメントと制限値だけ変更
--   - ADR-009: 識別子は `client_ip + persistent_cookie_id` の SHA-256 ハッシュに拡張
--   - UCL-002: JST 1 日 1 回 / 短期上限は撤廃
--
-- Down: RPC default を `p_short_limit=2 / p_daily_limit=2` に戻し、コメントを元の文言に戻す。
-- 実テーブル / 既存行への破壊的変更はないため revert は default 値の差し戻しで完結する。

COMMENT ON TABLE public.style_guest_generate_attempts IS
  'Cross-screen guest generate attempts (/style and /coordinate combined) for IP+Cookie-based rate limiting';
COMMENT ON COLUMN public.style_guest_generate_attempts.client_ip_hash IS
  'Salted SHA-256 hash of "<client_ip>|<persistent_cookie_id>" — see lib/guest-id.ts and features/style/lib/style-rate-limit.ts';

-- p_short_limit=999 は実質的に短期制限を無効化する目的（GUEST_SHORT_LIMIT は撤廃）。
-- 呼び出し側からも明示的に 999 / 1 を渡すが、保守性のため default も合わせておく。
CREATE OR REPLACE FUNCTION public.reserve_style_guest_generate_attempt(
  p_client_ip_hash TEXT,
  p_short_limit INTEGER DEFAULT 999,
  p_daily_limit INTEGER DEFAULT 1,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_short_count INTEGER;
  v_daily_count INTEGER;
  v_attempt_id UUID;
  v_jst_day_start TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_client_ip_hash, 0));

  v_jst_day_start := date_trunc('day', p_now, 'Asia/Tokyo');

  SELECT COUNT(*)
  INTO v_short_count
  FROM public.style_guest_generate_attempts
  WHERE client_ip_hash = p_client_ip_hash
    AND created_at >= (p_now - interval '1 minute')
    AND released_at IS NULL;

  IF v_short_count >= p_short_limit THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'attemptId', NULL,
      'reason', 'short_limit'
    );
  END IF;

  SELECT COUNT(*)
  INTO v_daily_count
  FROM public.style_guest_generate_attempts
  WHERE client_ip_hash = p_client_ip_hash
    AND created_at >= v_jst_day_start
    AND released_at IS NULL;

  IF v_daily_count >= p_daily_limit THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'attemptId', NULL,
      'reason', 'daily_limit'
    );
  END IF;

  INSERT INTO public.style_guest_generate_attempts (
    client_ip_hash,
    created_at
  )
  VALUES (
    p_client_ip_hash,
    p_now
  )
  RETURNING id INTO v_attempt_id;

  RETURN jsonb_build_object(
    'allowed', TRUE,
    'attemptId', v_attempt_id,
    'reason', NULL
  );
END;
$$;

COMMENT ON FUNCTION public.reserve_style_guest_generate_attempt(TEXT, INTEGER, INTEGER, TIMESTAMPTZ) IS
  'Reserve a cross-screen guest generation attempt (default: 1 per JST day). Identifier is "client_ip|cookie_id" hashed in app code. Short-window limit is effectively disabled by default; pass an explicit value to enforce one.';
