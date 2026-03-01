-- ===============================================
-- Referrals Table Migration
-- リファラル（紹介）特典機能: 紹介関係テーブルの作成
-- ===============================================

-- referralsテーブルを作成
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  referred_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  referral_code TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- コメント追加
COMMENT ON TABLE public.referrals IS
  '紹介関係を記録するテーブル。監査証跡として、かつべき等性保証用（referred_id UNIQUE制約により、同じユーザーが複数回紹介されることを防止）。';
COMMENT ON COLUMN public.referrals.referrer_id IS
  '紹介者のユーザーID';
COMMENT ON COLUMN public.referrals.referred_id IS
  '被紹介者のユーザーID（UNIQUE制約により、1ユーザーにつき1回のみ紹介成立を保証）';
COMMENT ON COLUMN public.referrals.referral_code IS
  '使用された紹介コード';

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_id ON public.referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referral_code ON public.referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_created_at ON public.referrals(created_at DESC);

-- RLSポリシー
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- 開発用ポリシー: すべての操作を許可（一時的）
CREATE POLICY "Dev: Allow all operations on referrals"
  ON public.referrals
  FOR ALL
  USING (true)
  WITH CHECK (true);

