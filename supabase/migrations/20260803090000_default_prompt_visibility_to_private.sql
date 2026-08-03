-- ===============================================
-- prompt_visibility の既定を private にする
-- ===============================================
-- 計画書 ADR-004b（既定を非公開にする）に DB 側を合わせる。
--
-- UI の既定は非公開へ変えたが、列の既定は 'public' のままだった。
-- 完了RPC はこの列を設定しないため、新しい生成物はすべて 'public' で作られ、
-- 投稿時にモーダルが値を送らない経路があるとプロンプトがコピー可能になる。
-- 「送り忘れたら開く」側に倒れているので、閉じる側へ直す。
--
-- 既存行の値は変わらない。影響するのはこれから作られる行だけである。
--
-- ## trigger をあわせて直す必要がある
--
-- enforce_generated_image_lineage は「root で private を選べるのは free のみ」
-- として、free 以外の private を例外にしている。既定を private にすると
-- coordinate / one_tap_style / inspire の**すべての生成**がこの分岐に当たり、
-- 生成が全滅する。
--
-- そこで INSERT では例外にせず 'public' へ正規化する。free 以外にとって
-- この列は意味を持たない（カードは出ず、派生生成の原作にもなれない）ので、
-- 既定値が流れ込んだだけの値を弾く理由がない。
--
-- UPDATE では従来どおり例外にする。そちらは投稿・編集モーダルからの
-- 明示的な指定であり、「free 以外では選べない」と伝える価値がある
-- （API ルートが 400 と専用コードへ変換している）。

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 既定値の変更。既存行は書き換えない。
ALTER TABLE public.generated_images
  ALTER COLUMN prompt_visibility SET DEFAULT 'private';

COMMENT ON COLUMN public.generated_images.prompt_visibility IS
  'public = フォロワーへプロンプトを開示 / private = 開示せず派生生成のみ許可。既定は private（送り忘れたら閉じる側へ倒す）。root で private を保てるのは generation_type=free のみで、それ以外は INSERT 時に public へ正規化される';

CREATE OR REPLACE FUNCTION public.enforce_generated_image_lineage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_origin public.generated_images%ROWTYPE;
BEGIN
  -- (a) 出所列はクライアントから触らせない。
  --     INSERT 時に値が入っている場合と、UPDATE で変化する場合の両方を見る。
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_trusted_lineage_writer()
       AND (NEW.source_post_id IS NOT NULL OR NEW.source_author_id IS NOT NULL)
    THEN
      RAISE EXCEPTION
        'source_post_id / source_author_id はクライアントから設定できない (REQ-009)';
    END IF;
  ELSE
    IF NEW.source_post_id IS DISTINCT FROM OLD.source_post_id
       OR NEW.source_author_id IS DISTINCT FROM OLD.source_author_id
    THEN
      -- (b) 作成後は誰であっても変更不可。NULL から非 NULL への後付けも拒否する。
      --     これを許すと「先に INSERT して後から UPDATE で出所を付ける」経路で
      --     author secret 側の trigger をすり抜けられる。
      RAISE EXCEPTION
        'source_post_id / source_author_id は作成後に変更できない (REQ-010)';
    END IF;
  END IF;

  IF NEW.source_post_id IS NOT NULL THEN
    -- (c) 自己参照は不正
    IF NEW.source_post_id = NEW.id THEN
      RAISE EXCEPTION 'source_post_id が自分自身を指している';
    END IF;

    -- (d) 派生投稿は投稿者の選択より優先して非公開にする (ADR-004)。
    --     プロンプトは原作者の資産であり、派生者に公開の権限はない。
    NEW.prompt_visibility := 'private';

    -- (e) 作成時は原作の実在・root・free・原作者一致を検証する。
    --     CHECK 制約は subquery を使えないため trigger で行う。
    IF TG_OP = 'INSERT' THEN
      SELECT * INTO v_origin
      FROM public.generated_images
      WHERE id = NEW.source_post_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'source_post_id が存在しない: %', NEW.source_post_id;
      END IF;

      IF v_origin.source_post_id IS NOT NULL THEN
        RAISE EXCEPTION 'source_post_id は root 投稿を指す必要がある（派生を指している）';
      END IF;

      IF v_origin.generation_type <> 'free' THEN
        RAISE EXCEPTION
          'source_post_id は generation_type=free の投稿のみ指せる: %', v_origin.generation_type;
      END IF;

      -- 派生画像自身も free でなければならない。
      -- 原作側だけを見ていると、API を直叩きして generationType を coordinate や
      -- one_tap_style にした派生が通り、通常の free とは違う builder で処理される。
      IF NEW.generation_type <> 'free' THEN
        RAISE EXCEPTION
          '派生画像の generation_type は free でなければならない: %', NEW.generation_type;
      END IF;

      IF NEW.source_author_id IS DISTINCT FROM v_origin.user_id THEN
        RAISE EXCEPTION 'source_author_id が原作の所有者と一致しない';
      END IF;
    END IF;
  ELSE
    -- (f) root で private を保てるのは free のみ。
    --     coordinate / one_tap_style / inspire は今回の対象外 (ADR-011)。
    IF NEW.prompt_visibility = 'private' AND NEW.generation_type <> 'free' THEN
      IF TG_OP = 'INSERT' THEN
        -- 列の既定 (private) が流れ込んだだけ。free 以外にとってこの列は
        -- 意味を持たない（カードは出ず、派生生成の原作にもなれない）ので、
        -- 例外にせず public へ正規化する。ここで弾くと coordinate と
        -- one_tap_style の生成が全滅する。
        NEW.prompt_visibility := 'public';
      ELSE
        -- UPDATE は投稿・編集モーダルからの明示的な指定。
        -- 「free 以外では選べない」と伝える価値があるので例外にする
        -- （API ルートが 400 と専用コードへ変換している）。
        RAISE EXCEPTION
          'prompt_visibility=private は generation_type=free のみ: %', NEW.generation_type;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ===============================================
-- 適用後の検証
-- ===============================================
-- 既定値が private になったことと、free 以外の生成が通ることを確かめる。
-- 一時テーブルではなく本体へ入れて必ずロールバックする（trigger は
-- 対象テーブルに紐づくため、本体でしか検証できない）。

DO $$
DECLARE
  v_default text;
  v_user uuid;
  v_free_visibility text;
  v_coordinate_visibility text;
BEGIN
  SELECT column_default INTO v_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'generated_images'
    AND column_name = 'prompt_visibility';

  IF v_default NOT LIKE '%private%' THEN
    RAISE EXCEPTION '既定値が private になっていない: %', v_default;
  END IF;

  SELECT user_id INTO v_user
  FROM public.generated_images
  WHERE user_id IS NOT NULL
  LIMIT 1;

  IF v_user IS NULL THEN
    RAISE NOTICE '検証用のユーザーが無いため挿入検証をスキップした';
    RETURN;
  END IF;

  -- free は既定の private のまま入る
  INSERT INTO public.generated_images (user_id, image_url, storage_path, prompt, is_posted, generation_type)
  VALUES (v_user, 'https://example.invalid/a.png', 'verify/a.png', '', false, 'free')
  RETURNING prompt_visibility INTO v_free_visibility;

  -- coordinate は public へ正規化される（例外にならない）
  INSERT INTO public.generated_images (user_id, image_url, storage_path, prompt, is_posted, generation_type)
  VALUES (v_user, 'https://example.invalid/b.png', 'verify/b.png', '', false, 'coordinate')
  RETURNING prompt_visibility INTO v_coordinate_visibility;

  IF v_free_visibility <> 'private' THEN
    RAISE EXCEPTION 'free の既定が private でない: %', v_free_visibility;
  END IF;

  IF v_coordinate_visibility <> 'public' THEN
    RAISE EXCEPTION 'coordinate が public へ正規化されていない: %', v_coordinate_visibility;
  END IF;

  -- 検証用の行は残さない
  DELETE FROM public.generated_images
  WHERE storage_path IN ('verify/a.png', 'verify/b.png');

  RAISE NOTICE '既定を private にし、free 以外は INSERT 時に public へ正規化する';
END;
$$;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- ALTER TABLE public.generated_images
--   ALTER COLUMN prompt_visibility SET DEFAULT 'public';
-- -- enforce_generated_image_lineage は 20260730200000 の定義へ戻す
-- COMMIT;
-- ===============================================
