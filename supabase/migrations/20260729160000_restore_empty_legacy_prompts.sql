-- ===============================================
-- 障害復旧(2): 空になってしまった legacy prompt を secret から書き戻す
-- ===============================================
-- Worker が旧完了 RPC を呼んでいた間に作られた行は、
--   generated_images.prompt = ''（空になった prompt_text をコピーしたため）
--   generated_image_prompt_secrets = 復旧マイグレーションで復元済み
-- という状態になっている。
--
-- 生成一覧などブラウザ側の画面はまだ author secret を読んでおらず、
-- generated_images.prompt を直接表示するため「プロンプト情報がありません」と
-- 出てしまう。移行期間中は legacy 列にも値がある前提なので、secret から
-- 書き戻して整合させる。
--
-- 対象は「secret があるのに legacy 列が空」の行だけ。運営資産(one_tap_style /
-- inspire)は secret を持たないため、この条件に一致しない。
--
-- Phase 0C で legacy 列を空化する前に、ブラウザ側の読み取り経路を
-- author secret へ移す必要がある。これはその移行までの暫定復旧である。

BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.generated_images AS gi
SET prompt = s.prompt
FROM public.generated_image_prompt_secrets AS s
WHERE s.image_id = gi.id
  AND gi.prompt = ''
  AND s.prompt <> '';

DO $$
DECLARE
  v_remaining integer;
  v_leaked integer;
BEGIN
  -- secret があるのに legacy 列が空の行が残っていないこと
  SELECT count(*)
  INTO v_remaining
  FROM public.generated_images AS gi
  JOIN public.generated_image_prompt_secrets AS s ON s.image_id = gi.id
  WHERE gi.prompt = ''
    AND s.prompt <> '';

  IF v_remaining > 0 THEN
    RAISE EXCEPTION '書き戻し漏れが % 件', v_remaining;
  END IF;

  -- 運営資産を legacy 列へ書き戻していないこと。
  -- one_tap_style / inspire は secret を持たないので 0 のはずだが、
  -- 条件を取り違えた場合にここで止める。
  SELECT count(*)
  INTO v_leaked
  FROM public.generated_image_prompt_secrets AS s
  JOIN public.generated_images AS gi ON gi.id = s.image_id
  WHERE gi.generation_type IN ('one_tap_style', 'inspire');

  IF v_leaked > 0 THEN
    RAISE EXCEPTION '運営資産が author secret に % 件混入している', v_leaked;
  END IF;
END;
$$;

COMMIT;
