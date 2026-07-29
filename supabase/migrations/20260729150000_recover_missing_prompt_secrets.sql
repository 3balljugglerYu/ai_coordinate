-- ===============================================
-- 障害復旧: 完了 RPC の切り替え漏れで失われた author secret を復元する
-- ===============================================
-- Worker は complete_image_job_with_prompt_secrets へ切り替えるはずだったが、
-- 呼び出し側を更新し忘れており、旧 complete_image_job_with_generated_images を
-- 呼び続けていた。
--
-- 旧 RPC は image_jobs.prompt_text を generated_images.prompt へコピーするが、
-- 新 Next.js は prompt_text を空にするようになったため、
--   - generated_images.prompt は空
--   - author secret も作られない
-- となり、生成した本人が自分のプロンプトを参照できなくなっていた。
--
-- 本文は generation_prompt_snapshots.author_input に残っているため復元できる。
-- One-Tap Style は provider_prompt しか持たず author secret を作らない仕様
-- なので、ここでも対象外である。

BEGIN;

SET LOCAL lock_timeout = '5s';

INSERT INTO public.generated_image_prompt_secrets (
  image_id,
  prompt,
  prompt_owner_id,
  source_kind,
  created_at
)
SELECT
  gi.id,
  sn.author_input,
  sn.author_input_owner_id,
  'author_input',
  gi.created_at
FROM public.generated_images AS gi
JOIN public.generation_prompt_snapshots AS sn
  ON sn.image_job_id = gi.image_job_id
WHERE sn.snapshot_kind = 'materialized'
  AND sn.author_input IS NOT NULL
  AND sn.author_input_owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.generated_image_prompt_secrets AS s
    WHERE s.image_id = gi.id
  )
ON CONFLICT (image_id) DO NOTHING;

DO $$
DECLARE
  v_orphan integer;
  v_leaked integer;
BEGIN
  -- 実行入力に本文があるのに secret が無い行が残っていないこと
  SELECT count(*)
  INTO v_orphan
  FROM public.generated_images AS gi
  JOIN public.generation_prompt_snapshots AS sn
    ON sn.image_job_id = gi.image_job_id
  WHERE sn.author_input IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.generated_image_prompt_secrets AS s
      WHERE s.image_id = gi.id
    );

  IF v_orphan > 0 THEN
    RAISE EXCEPTION '復元漏れが % 件', v_orphan;
  END IF;

  -- 運営資産が author secret へ紛れ込んでいないこと
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
