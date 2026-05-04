-- Gemini/manual worker path used to insert generated_images without image_job_id.
-- Before-image fallback and persistence depend on this link, so recover legacy
-- rows by matching the succeeded image_job's result_image_url to generated_images.image_url.
WITH candidate_matches AS (
  SELECT
    gi.id AS generated_image_id,
    ij.id AS image_job_id,
    row_number() OVER (
      PARTITION BY gi.id
      ORDER BY ij.completed_at DESC NULLS LAST, ij.created_at DESC
    ) AS generated_image_rank,
    row_number() OVER (
      PARTITION BY ij.id
      ORDER BY gi.created_at DESC
    ) AS image_job_rank
  FROM public.generated_images gi
  JOIN public.image_jobs ij
    ON ij.user_id = gi.user_id
   AND ij.result_image_url = gi.image_url
  WHERE gi.image_job_id IS NULL
    AND gi.image_job_result_index IS NULL
    AND ij.status = 'succeeded'
    AND ij.result_image_url IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.generated_images linked
      WHERE linked.image_job_id = ij.id
    )
)
UPDATE public.generated_images gi
SET
  image_job_id = candidate_matches.image_job_id,
  image_job_result_index = 0
FROM candidate_matches
WHERE gi.id = candidate_matches.generated_image_id
  AND candidate_matches.generated_image_rank = 1
  AND candidate_matches.image_job_rank = 1;
