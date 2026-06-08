-- ===============================================
-- 台紙テンプレ用 Storage バケット (private)
-- ===============================================
-- コレクション台紙テンプレ(キャラを抜いた空PNG)を保存する private バケット。
-- admin が管理する共有素材であり、ユーザー生成物(generated-images)とは分離する
-- (計画書 ADR-008)。
--
-- アップロード/読み取りは台紙管理 API・合成 API (service_role) のみが行う。
-- admin 判定は env ベース(getAdminUserIds)で DB ロールに無いため、Storage policy では
-- 表現できない。よって anon / authenticated には policy を付けず、service_role の
-- RLS bypass で書き込み・読み取りを行う(catalog-images と同方針)。
--
-- 生成済み台紙はユーザー成果物のため本バケットには置かず、generated-images 側の
-- 決定的パスに保存する(計画書 ADR-008)。公開ページ(OGP)向けの公開配信は Phase 5 で扱う。
-- ===============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'collection-mount-templates',
  'collection-mount-templates',
  false,
  10485760,
  ARRAY['image/png']
)
ON CONFLICT (id) DO NOTHING;

-- ===============================================
-- DOWN:
-- DELETE FROM storage.buckets WHERE id = 'collection-mount-templates';
-- ===============================================
