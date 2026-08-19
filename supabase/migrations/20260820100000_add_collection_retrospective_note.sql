-- 企画ごとの「所見」を保存できるようにする(ADR-004)。
--
-- 背景:
--   数字を自動で出せるようにしても、**判断の理由はどこにも残らない**。
--   「離脱は最初の2枚に集中している」「新規18名が1人も戻っていない」といった
--   読み取りは人が書くものであり、次の企画を設計するときに効くのはそちらだった。
--   数字だけ残って理由が消えると、半年後に同じ検討をやり直すことになる。
--
-- なぜ別テーブルにしないか:
--   1企画1件で、履歴の要件がない。別テーブルにすると join と RLS が増えるだけで
--   得がない。既存の PresetCategoryAdmin / PresetCategoryUpdate の列マッピングに
--   そのまま乗る。履歴が必要になったら admin_audit_log に本文ごと残しているので
--   そこから復元できる(ADR-007)。

BEGIN;

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS retrospective_note text NULL,
  ADD COLUMN IF NOT EXISTS retrospective_note_updated_at timestamptz NULL;

COMMENT ON COLUMN public.preset_categories.retrospective_note IS
  '企画の振り返り所見(admin が自由記述)。数字から読み取ったことと次回への申し送りを書く。表示は admin のコレクションタブのみ。';
COMMENT ON COLUMN public.preset_categories.retrospective_note_updated_at IS
  '所見の最終更新時刻。**サーバー側でのみ設定する**(クライアントの値は信用しない)。';

-- 長さの上限。UI 側の maxLength だけだと API 直叩きで無制限に書けてしまう。
-- 4000 文字は「A4 数枚ぶんの所見」を想定した実用上の余裕。
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_retrospective_note_length_check;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_retrospective_note_length_check
  CHECK (retrospective_note IS NULL OR length(retrospective_note) <= 4000);

/*
  本文が入っているのに更新時刻が無い(またはその逆)状態を作らせない。
  片方だけ書き込む経路が生まれると、画面が「いつの所見か分からない本文」を
  出すことになる。
*/
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_retrospective_note_pair_check;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_retrospective_note_pair_check
  CHECK (
    (retrospective_note IS NULL AND retrospective_note_updated_at IS NULL)
    OR (retrospective_note IS NOT NULL AND retrospective_note_updated_at IS NOT NULL)
  );

COMMIT;
