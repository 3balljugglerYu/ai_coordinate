-- ===============================================
-- Referral Code Migration
-- リファラル（紹介）特典機能: profilesテーブルの拡張
-- ===============================================

-- profilesテーブルにreferral_codeカラムを追加
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE NULL;

-- コメント追加
COMMENT ON COLUMN public.profiles.referral_code IS
  'ユーザーの紹介コード。ランダム文字列で生成され、他のユーザーが新規登録時に使用可能。';

-- インデックス作成（UNIQUE制約で自動的に作成されるが、明示的に記載）
-- UNIQUE制約により、referral_codeの一意性が保証される

