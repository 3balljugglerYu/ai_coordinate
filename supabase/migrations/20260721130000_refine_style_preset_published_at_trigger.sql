-- published_at トリガーの改善(PR #439 レビュー対応)。
--
-- 従来: published への遷移で常に published_at = now() に上書き。
-- 変更: 遷移と同時に published_at が明示的に指定された場合はその値を尊重する
--       (データ移行・過去日時の調整などで UPDATE ... SET status, published_at を
--        一度に実行できるように)。明示指定が無い場合は従来どおり now()。
CREATE OR REPLACE FUNCTION public.set_style_preset_published_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
      NEW.published_at = now();
    END IF;
  ELSIF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    -- published_at が変更されていない(= 明示指定なし)ときだけ自動設定する。
    IF NEW.published_at IS NOT DISTINCT FROM OLD.published_at THEN
      NEW.published_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
