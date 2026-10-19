-- ===============================================
-- アプリのプッシュ通知: 退会・停止した人の宛先を消す (REQ-008)
-- ===============================================
-- 計画書: docs/planning/push-notifications-implementation-plan.md REQ-008
--
-- 退会(request_account_deletion)と運営による停止(/api/admin/users/[userId]/suspend)は
-- どちらも profiles.deactivated_at を入れるだけで、auth.users は削除まで 30 日残る。
-- そのため push_device_tokens の ON DELETE CASCADE では宛先が消えず、
-- 退会したつもりの人にもプッシュが届いてしまう。
--
-- 【すること】
--   ・deactivated_at が入った時点で、その人の宛先をすべて消す(トリガー)。
--     退会の API(/api/account/deactivate)と停止の API のどちらを通っても消える
--   ・退会・停止のあいだは register_push_device でも登録しない。停止はセッションが
--     残るので、アプリが起動のたびに登録し直すと、消した宛先がすぐ戻るため
--   ・このマイグレーションより前に登録された、退会・停止中の人の宛先も消す
-- 退会の取り消し・停止の解除のあとは、アプリが次に起動したとき(ログイン状態に
-- なったとき)に登録し直す。

BEGIN;

-- profiles へのトリガーの追加は表のロックを取る。使われている表なので、待ちが長いときは
-- 待たずに失敗させる(やり直せばよい。利用者の書き込みを長く止めない)
SET LOCAL lock_timeout = '5s';

-- -----------------------------------------------
-- 退会・停止で宛先を消す
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_push_devices_on_deactivation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- 退会・停止そのものを止めないよう、ここでの失敗は握る
  -- (送る側でも fan_out_push_broadcasts が退会・停止中の人を除く)
  BEGIN
    DELETE FROM public.push_device_tokens
    WHERE user_id = NEW.user_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'delete_push_devices_on_deactivation failed for user %: %',
      NEW.user_id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.delete_push_devices_on_deactivation() IS
  'profiles.deactivated_at が入った(退会・停止)ときに、その人の push_device_tokens をすべて消す (REQ-008)。';

REVOKE ALL ON FUNCTION public.delete_push_devices_on_deactivation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_delete_push_devices_on_deactivation ON public.profiles;
CREATE TRIGGER trg_delete_push_devices_on_deactivation
  AFTER UPDATE OF deactivated_at ON public.profiles
  FOR EACH ROW
  WHEN (OLD.deactivated_at IS NULL AND NEW.deactivated_at IS NOT NULL)
  EXECUTE FUNCTION public.delete_push_devices_on_deactivation();

-- -----------------------------------------------
-- 退会・停止中は登録しない
-- -----------------------------------------------
-- 20261013120000 の定義に「退会・停止中なら登録せずに終える」を足しただけ(ほかは同じ)。
-- 別の人に結びついていた同じ端末・同じトークンは、その前に外す(この端末に
-- 前の人の宛先を残さない)。ロック待ちは 3 秒まで(超えたら lock_not_available の
-- エラーを返す。アプリは記録だけして、次の起動で登録し直す)。
CREATE OR REPLACE FUNCTION public.register_push_device(
  p_device_id TEXT,
  p_platform TEXT,
  p_token TEXT,
  p_app_version TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_deactivated_at TIMESTAMPTZ;
BEGIN
  -- アプリの起動を長く止めないよう、この関数の中のロック待ちはすべて 3 秒まで
  -- (下の FOR SHARE はプロフィールのほかの更新とも待ち合う。DELETE も行のロックを待つ)
  PERFORM set_config('lock_timeout', '3s', true);

  -- 利用者はセッションからだけ決める(引数で受け取らない)
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'register_push_device_not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- 別の人に結びついていた同じ端末・同じトークンを外す
  DELETE FROM public.push_device_tokens
  WHERE (device_id = p_device_id OR token = p_token)
    AND user_id <> v_user_id;

  -- 退会・停止中の人は登録しない(REQ-008)。残っている宛先があれば消す。
  -- FOR SHARE で読むのは、退会・停止(profiles.deactivated_at の UPDATE)と順番に並べるため。
  --   停止が先: この SELECT は停止の COMMIT を待ち、deactivated_at を見て登録しない
  --   登録が先: 停止の UPDATE がこの関数の COMMIT を待ち、そのあとのトリガーの DELETE が
  --             登録した行を見て消す
  -- (ただの SELECT だと、どちらも相手の書き込みを見ずに進み、宛先が残ることがある)
  SELECT deactivated_at INTO v_deactivated_at
  FROM public.profiles
  WHERE user_id = v_user_id
  FOR SHARE;

  IF v_deactivated_at IS NOT NULL THEN
    DELETE FROM public.push_device_tokens
    WHERE user_id = v_user_id;
    RETURN;
  END IF;

  -- 本人の行で、端末は同じだがトークンが変わった/トークンは同じだが端末が違う、
  -- の重複も1行にまとめる
  DELETE FROM public.push_device_tokens
  WHERE user_id = v_user_id
    AND token = p_token
    AND device_id <> p_device_id;

  -- 上の DELETE とこの INSERT のあいだに別の人が同じ端末を登録していても、
  -- 最後に登録した人の行にする(user_id も付け替える)
  INSERT INTO public.push_device_tokens (
    user_id, device_id, platform, token, app_version, last_seen_at
  ) VALUES (
    v_user_id, p_device_id, p_platform, p_token, p_app_version, now()
  )
  ON CONFLICT (device_id) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      platform = EXCLUDED.platform,
      token = EXCLUDED.token,
      app_version = EXCLUDED.app_version,
      last_seen_at = now();
END;
$$;

COMMENT ON FUNCTION public.register_push_device(TEXT, TEXT, TEXT, TEXT) IS
  'ログイン中の利用者の端末の FCM 宛先を登録・更新する。同じ端末・同じトークンが別の利用者に結びついていたら付け替える (ADR-008, ADR-009 / REQ-007)。退会・停止中の人は登録しない (REQ-008)。';

REVOKE ALL ON FUNCTION public.register_push_device(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_push_device(TEXT, TEXT, TEXT, TEXT)
  TO authenticated;

-- -----------------------------------------------
-- すでに退会・停止中の人の宛先を消す
-- -----------------------------------------------
-- 2026-10-14 の本番は宛先 0 件(アプリの登録は Phase 3 から)。念のため
DELETE FROM public.push_device_tokens t
USING public.profiles p
WHERE p.user_id = t.user_id
  AND p.deactivated_at IS NOT NULL;

COMMIT;

-- ===============================================
-- DOWN:
--   DROP TRIGGER IF EXISTS trg_delete_push_devices_on_deactivation ON public.profiles;
--   DROP FUNCTION IF EXISTS public.delete_push_devices_on_deactivation();
--   register_push_device を 20261013120000 の定義に戻す
--   (消した宛先は戻らない。アプリが次に起動したときに登録し直す)
-- ===============================================
