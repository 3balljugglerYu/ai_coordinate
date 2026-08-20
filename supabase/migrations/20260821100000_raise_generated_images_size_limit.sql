-- generated-images バケットの上限を 10MB → 25MB に引き上げる。
--
-- 背景:
--   この 10MB は 2025-01-09 の初期構築(20250109000001_initial_setup.sql)で
--   決めた値で、当時は 1K 出力しか無かった。その後 gpt-image-2 / Gemini に
--   2K・4K を足したが、**受け皿の上限を見直していなかった**。
--
--   結果、4K を選んだ生成だけが保存段階で落ちていた:
--     "画像のアップロードに失敗しました: The object exceeded the maximum allowed size"
--
--   画像生成そのものは 52 秒かけて完走しており(processing_stage=uploading で失敗)、
--   OpenAI / Gemini 側の制約ではない。長辺 3840px は両社の公式仕様の範囲内。
--
-- 実測(2026-08-21 時点):
--   generated-images の最大オブジェクトは 9.85MB で、上限 10MB に張り付いていた。
--   平均は 0.64MB(直近90日 13,493件)なので、影響を受けるのは 4K を選んだ少数のみ。
--   同種の失敗は 2026-02 以降で4件、いずれも 4K(gpt-image-2-high-4k /
--   gemini-3-pro-image-4k / gpt-image-2-medium-4k)。
--
-- 25MB の根拠:
--   3840x2160 の PNG は絵柄によって 5〜25MB に振れる。観測最大 9.85MB の
--   2.5 倍を確保し、high 4k でも通るようにする。
--
-- 副作用として、認証ユーザーが自分のフォルダへ直接アップロードできる上限も
-- 10MB → 25MB になる(RLS ポリシーは初期構築時のまま)。生成物の保存経路は
-- service_role で、ユーザー入力画像は API 側で正規化してから保存しているため
-- 通常運用では変わらないが、上限そのものが緩むことは認識しておく。
--
-- 根本策は「保存前に WebP へ変換する」(現状は provider が返す PNG をそのまま
-- 保存し、WebP 化は保存後の ensure-webp で行っている)。容量が約1/3になり
-- この種の失敗はほぼ消えるが、Worker の変更が要るため別途とする。

BEGIN;

UPDATE storage.buckets
SET file_size_limit = 26214400  -- 25MB
WHERE id = 'generated-images';

DO $$
DECLARE
  v_limit bigint;
BEGIN
  SELECT file_size_limit INTO v_limit
  FROM storage.buckets WHERE id = 'generated-images';

  IF v_limit IS DISTINCT FROM 26214400 THEN
    RAISE EXCEPTION 'generated-images の上限が想定と違う (実際: %)', v_limit;
  END IF;
  RAISE NOTICE 'generated-images の上限を 25MB に設定';
END;
$$;

COMMIT;
