-- ===============================================
-- image_jobs.model を作成後不変にする(TOCTOU 対策)
-- ===============================================
-- 設計判断: docs/planning/gpt-image-2-5-flare-implementation-plan.md
--           ADR-007 / REQ-015(§1-6b)
--
-- 背景: RLS `Users can update their own image_jobs` は列を絞っておらず、
-- 本人はジョブ作成後に全列を UPDATE できる。worker は行を再取得してから
-- 実行・課金するため、ゲートを通った後に model だけ 2.5 へ書き換えると
-- サーバーゲート(isGptImage25Available)を素通りできてしまう。
--
-- 対策: model の変更を DB 層で無条件に拒否する。
-- 作成後に image_jobs.model を書き換える正規経路は存在しない(実装で確認済み:
-- TS 側の `.from("image_jobs").update(...)` は status / error / metadata 系のみ、
-- `complete_image_job_with_prompt_secrets` の p_model は generated_images の
-- INSERT にしか使わない)ため、service_role にも例外を設けない。
--
-- 発火は `UPDATE OF model` に限定する。worker の status 更新(queued → processing
-- → succeeded)は SET 句に model を含まないので、この trigger は呼ばれない。
-- 同じ値を SET しても IS DISTINCT FROM が false なので通る。
--
-- 適用順は CHECK 拡張(20260910120000)と同じ回で構わない(どちらが先でもよい)。

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.enforce_image_job_model_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.model IS DISTINCT FROM OLD.model THEN
    RAISE EXCEPTION
      'image_jobs.model は作成後に変更できない (ADR-007 / REQ-015): % -> %',
      COALESCE(OLD.model, '<null>'),
      COALESCE(NEW.model, '<null>');
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_image_job_model_immutable() IS
  'image_jobs.model の作成後変更を無条件に拒否する。ゲート通過後の書き換えで課金モデルと実行モデルをすり替える TOCTOU を塞ぐ (ADR-007)';

DROP TRIGGER IF EXISTS trg_enforce_image_job_model_immutable ON public.image_jobs;
CREATE TRIGGER trg_enforce_image_job_model_immutable
  BEFORE UPDATE OF model ON public.image_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_image_job_model_immutable();

-- ===============================================
-- 検証 1: 同じ関数を一時テーブルに付けて挙動を固定する
-- ===============================================
-- 本番の image_jobs へ行を INSERT せずに、trigger 関数そのものを検証する。
-- リポジトリに SQL のテスト基盤が無いため、想定が崩れたら適用時点で落とす。
DO $$
DECLARE
  v_blocked boolean := false;
  v_message text := '';
BEGIN
  CREATE TEMP TABLE tmp_image_job_model_freeze_check (
    id integer PRIMARY KEY,
    model text,
    status text
  );
  CREATE TRIGGER trg_tmp_image_job_model_freeze_check
    BEFORE UPDATE OF model ON tmp_image_job_model_freeze_check
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_image_job_model_immutable();

  INSERT INTO tmp_image_job_model_freeze_check (id, model, status)
  VALUES (1, 'gpt-image-2-low-1k', 'queued');

  -- (a) model 以外の列の更新(worker の status 更新に相当)は通る
  UPDATE tmp_image_job_model_freeze_check
  SET status = 'processing'
  WHERE id = 1;

  -- (b) 同じ値を SET しても通る(IS DISTINCT FROM)
  UPDATE tmp_image_job_model_freeze_check
  SET model = 'gpt-image-2-low-1k', status = 'succeeded'
  WHERE id = 1;

  -- (c) 値を変える UPDATE は拒否される
  BEGIN
    UPDATE tmp_image_job_model_freeze_check
    SET model = 'gpt-image-2.5-flare-low-1k'
    WHERE id = 1;
  EXCEPTION
    WHEN raise_exception THEN
      v_blocked := true;
      v_message := SQLERRM;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'enforce_image_job_model_immutable が model の変更を拒否しなかった';
  END IF;
  IF position('ADR-007' IN v_message) = 0 THEN
    RAISE EXCEPTION '想定外の例外で止まった: %', v_message;
  END IF;

  -- (d) NULL への変更も拒否される
  v_blocked := false;
  BEGIN
    UPDATE tmp_image_job_model_freeze_check
    SET model = NULL
    WHERE id = 1;
  EXCEPTION
    WHEN raise_exception THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'enforce_image_job_model_immutable が model の NULL 化を拒否しなかった';
  END IF;

  DROP TABLE tmp_image_job_model_freeze_check;
END;
$$;

-- ===============================================
-- 検証 2: 本番テーブルに trigger が有効な状態で付いていること
-- ===============================================
DO $$
DECLARE
  v_enabled "char";
BEGIN
  SELECT tg.tgenabled
    INTO v_enabled
  FROM pg_trigger tg
  JOIN pg_class t ON t.oid = tg.tgrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'image_jobs'
    AND tg.tgname = 'trg_enforce_image_job_model_immutable'
    AND NOT tg.tgisinternal;

  IF v_enabled IS NULL THEN
    RAISE EXCEPTION 'trg_enforce_image_job_model_immutable が public.image_jobs に付いていない';
  END IF;
  IF v_enabled = 'D' THEN
    RAISE EXCEPTION 'trg_enforce_image_job_model_immutable が無効化されている';
  END IF;
END;
$$;

COMMIT;
