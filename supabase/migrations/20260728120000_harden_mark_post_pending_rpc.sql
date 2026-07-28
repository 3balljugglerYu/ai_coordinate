-- ===============================================
-- mark_post_pending_by_report の権限是正と入力検証
-- ===============================================
-- 設計判断: docs/planning/post-moderation-notification-implementation-plan.md ADR-010, REQ-019〜021
--
-- 【背景】
-- 既存の mark_post_pending_by_report は SECURITY DEFINER でありながら、
-- 本番 ACL 実測で anon / authenticated に EXECUTE が付いていた。
-- (migration には GRANT EXECUTE TO authenticated しか無いが、Supabase の
--  default privileges により anon にも付与される)
--
-- 関数は auth.uid() を一切参照せず、p_actor_id / p_reason が呼出者任せで、
-- post_reports の存在確認も無い。更新条件は is_posted = true AND
-- moderation_status = 'visible' のみ。このため:
--
--   1. 公開 anon キーだけで任意の公開投稿を pending (全ユーザーから非表示)
--      にできる。anon キーはクライアントバンドルに含まれる公開値であり、
--      PostgREST の /rest/v1/rpc/ 経由で直接到達できる
--   2. p_reason='admin_immediate' と任意の p_actor_id を渡して
--      「運営が即時非表示にした」偽の監査ログを作れる
--   3. SECURITY DEFINER は RLS をバイパスするため、moderation_audit_logs の
--      RLS を厳格化してもこの経路からの任意行 INSERT は止まらない
--
-- 【対応】
-- pending 化を service_role 経路に一本化する。通報ルート
-- (app/api/reports/posts/route.ts) は createAdminClient() から呼ぶよう
-- 同一コミットで変更済み。
--
-- 関数シグネチャは変更しないため、呼出側の引数修正は不要。
--
-- 【デプロイ順序 (REQ-021)】
-- 本マイグレーションは「今動いているコードから権限を剥がす」方向のため、
-- 必ず **アプリのデプロイ完了後** に適用すること。先に適用すると、
-- 旧コード (セッションクライアントから呼ぶ) が権限エラーになり、
-- 通報しきい値到達時の自動非表示が停止する。
--
-- 正しい順序: マージ → Vercel デプロイ完了 → 本マイグレーション適用

BEGIN;

-- 関数本体を差し替え (CREATE OR REPLACE は既存の権限を保持するため、
-- REVOKE / GRANT は本文の後に実行する)
CREATE OR REPLACE FUNCTION public.mark_post_pending_by_report(
  p_post_id UUID,
  p_actor_id UUID,
  p_reason TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id UUID;
  v_reason TEXT;
BEGIN
  -- 既存呼出との互換のため、空文字 / NULL は従来どおり report_threshold に倒す
  v_reason := COALESCE(NULLIF(p_reason, ''), 'report_threshold');

  -- reason を既知の2値に限定する。呼出者が任意文字列を監査ログへ書ける状態を塞ぐ
  IF v_reason NOT IN ('report_threshold', 'admin_immediate') THEN
    RAISE EXCEPTION 'invalid_pending_reason'
      USING ERRCODE = '22023',
            HINT = 'p_reason must be report_threshold or admin_immediate.';
  END IF;

  -- admin_immediate は運営通報の即時 pending 化専用。
  -- API 層 (env ADMIN_USER_IDS) に加え DB 側でも admin_users で fail-closed に検証する。
  -- 既存の app/api/style-presets/submissions/route.ts と同じ二重検証パターン。
  IF v_reason = 'admin_immediate' AND NOT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = p_actor_id
  ) THEN
    RAISE EXCEPTION 'admin_immediate_requires_admin_actor'
      USING ERRCODE = '42501',
            HINT = 'p_actor_id must exist in admin_users when p_reason is admin_immediate.';
  END IF;

  UPDATE public.generated_images
  SET
    moderation_status = 'pending',
    moderation_reason = v_reason,
    moderation_updated_at = now()
  WHERE id = p_post_id
    AND is_posted = true
    AND moderation_status = 'visible'
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.moderation_audit_logs (
    post_id,
    actor_id,
    action,
    reason,
    metadata
  ) VALUES (
    p_post_id,
    p_actor_id,
    'pending_auto',
    v_reason,
    COALESCE(p_metadata, '{}'::JSONB)
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.mark_post_pending_by_report(UUID, UUID, TEXT, JSONB) IS
  '通報による投稿の pending 化。service_role 専用 (ADR-010)。reason は report_threshold / admin_immediate のみ。admin_immediate は admin_users で fail-closed に検証する。';

-- 権限是正: anon / authenticated からの直接実行を止め、service_role のみに限定する
REVOKE ALL ON FUNCTION public.mark_post_pending_by_report(UUID, UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_post_pending_by_report(UUID, UUID, TEXT, JSONB)
  TO service_role;

COMMIT;

-- ===============================================
-- DOWN:
-- 権限の再付与は行わない。anon / authenticated への EXECUTE 復活は
-- 脆弱性の再導入にあたるため、ロールバック対象外とする (計画のロールバック方針)。
-- 万一通報フローが停止した場合は、権限を戻すのではなく
-- app/api/reports/posts/route.ts のクライアント差し替えを修正すること。
--
-- 入力検証だけを外したい場合は、本ファイルの CREATE OR REPLACE から
-- v_reason の検証ブロックを除いたものを再適用する。
-- ===============================================
