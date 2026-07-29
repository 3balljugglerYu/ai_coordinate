-- ===============================================
-- Phase 0B: 既存プロンプトを author secret へ移行する
-- ===============================================
-- 設計判断: docs/planning/free-prompt-private-mode-implementation-plan.md
--           ADR-001 / REQ-003a
--
-- generated_images.prompt に保存されている値の実態（本番実測）:
--
--   generation_type | 全行  | 非空  | 運営の錨を含む | 中身
--   ----------------+-------+-------+----------------+-------------------------
--   coordinate      | 1,307 | 1,302 |            0   | ユーザーの生入力
--   free            |    21 |    21 |            0   | ユーザーの生入力
--   one_tap_style   | 2,110 | 2,069 |        1,165   | 運営の組み立て済み全文
--   inspire         |    89 |    89 |            0   | "inspire" / "creator-looks"
--
-- 組み立ては Worker が実行時に行うため、coordinate / free には運営の錨が
-- 入っていない。したがって加工せずそのまま author input として移せる。
--
-- 移行しないもの:
--   one_tap_style  運営資産。生成した本人にも開示しない (REQ-019)
--   inspire        マーカー値しか入っておらず開示する意味がない
--   空文字         移す内容が無い
--
-- 冪等にするため ON CONFLICT DO NOTHING とする。dual-write 中に Worker が
-- 先に secret を作った行は、そのまま残す。

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
  gi.prompt,
  gi.user_id,
  'author_input',
  gi.created_at
FROM public.generated_images AS gi
WHERE gi.generation_type IN ('coordinate', 'free')
  AND gi.prompt <> ''
  AND gi.user_id IS NOT NULL
ON CONFLICT (image_id) DO NOTHING;

-- ===============================================
-- 検証: 平文をログへ出さずに移行漏れと不整合を確認する
-- ===============================================
-- 1 件でもずれていればここで失敗し、トランザクションごと巻き戻る。

DO $$
DECLARE
  v_expected integer;
  v_migrated integer;
  v_digest_mismatch integer;
  v_owner_mismatch integer;
  v_leaked_platform integer;
BEGIN
  -- 移行対象の件数
  SELECT count(*)
  INTO v_expected
  FROM public.generated_images
  WHERE generation_type IN ('coordinate', 'free')
    AND prompt <> ''
    AND user_id IS NOT NULL;

  -- 実際に secret を持っている件数
  SELECT count(*)
  INTO v_migrated
  FROM public.generated_images AS gi
  JOIN public.generated_image_prompt_secrets AS s ON s.image_id = gi.id
  WHERE gi.generation_type IN ('coordinate', 'free')
    AND gi.prompt <> ''
    AND gi.user_id IS NOT NULL;

  IF v_expected <> v_migrated THEN
    RAISE EXCEPTION
      '移行漏れ: 対象 % 件に対して secret は % 件', v_expected, v_migrated;
  END IF;

  -- 行ごとの内容一致。平文を出さないため md5 で突き合わせる。
  SELECT count(*)
  INTO v_digest_mismatch
  FROM public.generated_images AS gi
  JOIN public.generated_image_prompt_secrets AS s ON s.image_id = gi.id
  WHERE gi.generation_type IN ('coordinate', 'free')
    AND gi.prompt <> ''
    AND md5(gi.prompt) <> md5(s.prompt);

  IF v_digest_mismatch > 0 THEN
    RAISE EXCEPTION '内容不一致が % 件', v_digest_mismatch;
  END IF;

  -- 所有者の不一致。プロンプトの所有者は画像の所有者と一致しないことが
  -- あるが、coordinate / free に限れば本人の入力なので一致するはず。
  SELECT count(*)
  INTO v_owner_mismatch
  FROM public.generated_images AS gi
  JOIN public.generated_image_prompt_secrets AS s ON s.image_id = gi.id
  WHERE gi.generation_type IN ('coordinate', 'free')
    AND s.prompt_owner_id <> gi.user_id;

  IF v_owner_mismatch > 0 THEN
    RAISE EXCEPTION '所有者不一致が % 件', v_owner_mismatch;
  END IF;

  -- 運営資産が author secret へ紛れ込んでいないこと。
  -- ここが 0 でないと、生成した本人が運営プリセットを読めるようになる。
  SELECT count(*)
  INTO v_leaked_platform
  FROM public.generated_images AS gi
  JOIN public.generated_image_prompt_secrets AS s ON s.image_id = gi.id
  WHERE gi.generation_type IN ('one_tap_style', 'inspire');

  IF v_leaked_platform > 0 THEN
    RAISE EXCEPTION
      '運営資産が author secret に % 件混入している', v_leaked_platform;
  END IF;

  RAISE NOTICE 'backfill 完了: % 件を author_input として移行', v_migrated;
END;
$$;

COMMIT;

-- ===============================================
-- DOWN:
-- 移行済みの secret を消すと、Phase 0C 後は表示手段が無くなる。
-- 巻き戻す場合は legacy 列がまだ非空であることを確認してから実行すること。
-- BEGIN;
-- DELETE FROM public.generated_image_prompt_secrets
-- WHERE source_kind = 'author_input';
-- COMMIT;
-- ===============================================
