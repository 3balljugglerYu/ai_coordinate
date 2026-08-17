-- cleanup-temp-images が temp/ の古いオブジェクトを列挙するための RPC。
--
-- 背景: この Edge Function は `supabase.schema("storage").from("objects")` で
-- storage.objects を直接 SELECT していたが、PostgREST が公開しているスキーマは
-- public / graphql_public だけなので**毎回 500 で落ちていた**。
--   {"error":"select_failed",
--    "message":"The schema must be one of the following: public, graphql_public"}
-- cron 自体は成功扱い(net.http_post はリクエストIDを返すだけ)のため気づけず、
-- 2026年1月以降 temp/ に 1,082件・691MB が滞留していた。
--
-- storage スキーマ全体を PostgREST に公開するのは影響範囲が広すぎるため、
-- **必要な読み取りだけ**を public の SECURITY DEFINER 関数として出す。
--
-- 対象は temp/ に固定する(引数で bucket/prefix を受けない)。
-- 任意のバケットを列挙できる汎用関数にすると、この関数自体が情報漏洩経路になる。
-- 削除は行わない(実体の削除は Storage API 経由で Edge Function が行う)。

CREATE OR REPLACE FUNCTION public.list_stale_temp_image_objects(
  p_cutoff timestamptz,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE (name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT o.name
  FROM storage.objects AS o
  WHERE o.bucket_id = 'generated-images'
    AND o.name LIKE 'temp/%'
    AND o.created_at < p_cutoff
  ORDER BY o.created_at
  LIMIT least(greatest(coalesce(p_limit, 1000), 1), 1000);
$$;

COMMENT ON FUNCTION public.list_stale_temp_image_objects(timestamptz, integer) IS
  'cleanup-temp-images 専用。generated-images バケットの temp/ 配下で p_cutoff より古いオブジェクト名を返す(読み取りのみ)。';

-- service_role だけが実行できる。anon/authenticated に渡すと
-- 他人のアップロード中ファイル名が読めてしまう。
REVOKE ALL ON FUNCTION public.list_stale_temp_image_objects(timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_stale_temp_image_objects(timestamptz, integer) FROM anon;
REVOKE ALL ON FUNCTION public.list_stale_temp_image_objects(timestamptz, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.list_stale_temp_image_objects(timestamptz, integer) TO service_role;
