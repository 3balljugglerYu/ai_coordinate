-- ===============================================
-- Backfill missing follows base schema
-- Supabase Branching / clean replay で public.follows が存在しない問題を補完
-- ===============================================

CREATE TABLE IF NOT EXISTS public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  followee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(follower_id, followee_id),
  CHECK(follower_id != followee_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower_id
  ON public.follows(follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_followee_id
  ON public.follows(followee_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'follows'
      AND policyname = 'Users can view follows they are involved in'
  ) THEN
    CREATE POLICY "Users can view follows they are involved in"
      ON public.follows
      FOR SELECT
      USING ((select auth.uid()) = follower_id OR (select auth.uid()) = followee_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'follows'
      AND policyname = 'Users can follow others'
  ) THEN
    CREATE POLICY "Users can follow others"
      ON public.follows
      FOR INSERT
      WITH CHECK ((select auth.uid()) = follower_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'follows'
      AND policyname = 'Users can unfollow others'
  ) THEN
    CREATE POLICY "Users can unfollow others"
      ON public.follows
      FOR DELETE
      USING ((select auth.uid()) = follower_id);
  END IF;
END
$$;

COMMENT ON TABLE public.follows IS 'ユーザー間のフォロー関係';
