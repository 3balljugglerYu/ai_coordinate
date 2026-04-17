-- ===============================================
-- Cleanup invalid tombstone parent comments without replies
-- 仕様上ありえない「返信なし tombstone 親コメント」を物理削除する
-- ===============================================

DELETE FROM public.comments AS parent
WHERE parent.parent_comment_id IS NULL
  AND parent.deleted_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.comments AS reply
    WHERE reply.parent_comment_id = parent.id
  );
