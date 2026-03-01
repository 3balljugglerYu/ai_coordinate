-- ===============================================
-- Credit System Migration
-- クレジット管理テーブルと新規登録特典の実装
-- ===============================================

-- user_credits テーブル
-- 役割: 各ユーザーのクレジット残高を管理
CREATE TABLE IF NOT EXISTS public.user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  balance INTEGER DEFAULT 0 NOT NULL CHECK (balance >= 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- credit_transactions テーブル
-- 役割: クレジットの購入・消費・返金など、すべての取引履歴を記録
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'consumption', 'refund', 'signup_bonus', 'daily_post', 'streak', 'referral')),
  stripe_payment_intent_id TEXT,
  related_generation_id UUID REFERENCES public.generated_images(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON public.user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON public.credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON public.credit_transactions(transaction_type);

-- ===============================================
-- RLS ポリシー
-- ===============================================

-- user_credits: RLSを有効化
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

-- 開発用ポリシー: すべての操作を許可（一時的）
CREATE POLICY "Dev: Allow all operations on user_credits"
  ON public.user_credits
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- credit_transactions: RLSを有効化
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- 開発用ポリシー: すべての操作を許可（一時的）
CREATE POLICY "Dev: Allow all operations on credit_transactions"
  ON public.credit_transactions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ===============================================
-- 新規登録特典トリガー
-- ===============================================

-- トリガー関数: 新規ユーザー登録時に50クレジットを付与
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- user_creditsレコードを作成（初期残高50）
  INSERT INTO public.user_credits (user_id, balance)
  VALUES (NEW.id, 50);

  -- credit_transactionsに記録
  INSERT INTO public.credit_transactions (user_id, amount, transaction_type)
  VALUES (NEW.id, 50, 'signup_bonus');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガー作成: auth.usersに新規ユーザーが追加されたときに実行
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ===============================================
-- updated_at自動更新トリガー
-- ===============================================

-- トリガー関数: updated_atを自動更新
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガー作成: user_creditsのupdated_atを自動更新
DROP TRIGGER IF EXISTS update_user_credits_updated_at ON public.user_credits;
CREATE TRIGGER update_user_credits_updated_at
  BEFORE UPDATE ON public.user_credits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

