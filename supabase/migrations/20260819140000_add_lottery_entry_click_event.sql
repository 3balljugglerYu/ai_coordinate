-- 「Xで応募する」を、通常のシェアと区別して数えられるようにする。
--
-- 背景:
--   応募ボタン(XLotteryEntryButton)は押下時に trackMountShareEvent をそのまま
--   呼んでいたため、通常のシェアボタンと**同じ mount_shared だけ**が記録されていた。
--   その結果「シェアURL発行数」と「応募数」が同じ数字になり、分離できなかった
--   (ファッション雑誌企画の28件は両者の合算で、応募だけを取り出せなかった)。
--
-- 対処:
--   応募専用の event_type を1つ足す。mount_shared は**これまでどおり記録し続ける**。
--   応募はシェアURLの発行でもあるので、発行数の定義を変えると過去の企画と
--   比較できなくなる。応募は mount_shared に「上乗せ」する形で数える。
--
--   したがって集計上の関係は常に次のようになる:
--     mount_shared        >= lottery_entry_click
--     通常シェアのみの回数 =  mount_shared - lottery_entry_click
--
-- 既存行には影響しない(値を足すだけ)。

BEGIN;

ALTER TABLE public.style_usage_events
  DROP CONSTRAINT IF EXISTS style_usage_events_event_type_check;

ALTER TABLE public.style_usage_events
  ADD CONSTRAINT style_usage_events_event_type_check
  CHECK (
    event_type = ANY (ARRAY[
      'visit'::text,
      'generate_attempt'::text,
      'generate'::text,
      'download'::text,
      'rate_limited'::text,
      'signup_click'::text,
      'wardrobe_save_click'::text,
      'wardrobe_save_completed'::text,
      'complete_achieved'::text,
      'mount_generated'::text,
      'mount_shared'::text,
      -- 抽選キャンペーンの「Xで応募する」押下。mount_shared と同時に記録される。
      'lottery_entry_click'::text
    ])
  );

-- 制約を張り替えただけでは、既存行が新しい定義を満たすかは検証されない
-- (ADD CONSTRAINT は既存行を検証するが、取りこぼしがないことを明示的に確認する)。
DO $$
DECLARE
  v_invalid bigint;
BEGIN
  SELECT count(*) INTO v_invalid
  FROM public.style_usage_events
  WHERE event_type NOT IN (
    'visit', 'generate_attempt', 'generate', 'download', 'rate_limited',
    'signup_click', 'wardrobe_save_click', 'wardrobe_save_completed',
    'complete_achieved', 'mount_generated', 'mount_shared', 'lottery_entry_click'
  );

  IF v_invalid > 0 THEN
    RAISE EXCEPTION '新しい CHECK を満たさない既存行が % 件ある', v_invalid;
  END IF;
END;
$$;

COMMIT;
