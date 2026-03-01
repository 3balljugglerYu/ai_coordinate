-- ===============================================
-- Replace Dev: Allow all with production RLS
-- アドバイザー「RLS Policy Always True」の解消
-- ===============================================

-- user_credits: 本人の残高のみ
DROP POLICY IF EXISTS "Dev: Allow all operations on user_credits" ON public.user_credits;
CREATE POLICY "Users can view their own user_credits"
  ON public.user_credits
  FOR SELECT
  USING (user_id = (select auth.uid()));

-- credit_transactions: 本人の取引のみ（INSERT/UPDATE/DELETE は RPC/Edge Function 経由）
DROP POLICY IF EXISTS "Dev: Allow all operations on credit_transactions" ON public.credit_transactions;
CREATE POLICY "Users can view their own credit_transactions"
  ON public.credit_transactions
  FOR SELECT
  USING (user_id = (select auth.uid()));

-- generated_images: 自分の画像 CRUD + 投稿済みは誰でも SELECT
DROP POLICY IF EXISTS "Dev: Allow all operations" ON public.generated_images;
CREATE POLICY "Users can view their own images"
  ON public.generated_images
  FOR SELECT
  USING ((select auth.uid()) = user_id);
CREATE POLICY "Posted images are viewable by everyone"
  ON public.generated_images
  FOR SELECT
  USING (is_posted = true);
CREATE POLICY "Users can insert their own images"
  ON public.generated_images
  FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update their own images"
  ON public.generated_images
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete their own images"
  ON public.generated_images
  FOR DELETE
  USING ((select auth.uid()) = user_id);

-- referrals: 紹介者/被紹介者のみ
DROP POLICY IF EXISTS "Dev: Allow all operations on referrals" ON public.referrals;
CREATE POLICY "Users can view referrals they are part of"
  ON public.referrals
  FOR SELECT
  USING (
    referrer_id = (select auth.uid()) OR referred_id = (select auth.uid())
  );
CREATE POLICY "Referred users can create referral record"
  ON public.referrals
  FOR INSERT
  WITH CHECK (referred_id = (select auth.uid()));
