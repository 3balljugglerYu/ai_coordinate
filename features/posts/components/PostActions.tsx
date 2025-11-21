"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditPostModal } from "./EditPostModal";
import { DeletePostDialog } from "./DeletePostDialog";
import { getCurrentUser } from "@/features/auth/lib/auth-client";

interface PostActionsProps {
  postId: string;
  postUserId: string;
  currentCaption?: string | null;
  imageUrl?: string;
}

export function PostActions({
  postId,
  postUserId,
  currentCaption,
  imageUrl,
}: PostActionsProps) {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const user = await getCurrentUser();
        setCurrentUserId(user?.id || null);
      } catch (error) {
        console.error("Auth check error:", error);
        setCurrentUserId(null);
      } finally {
        setIsLoading(false);
      }
    }

    checkAuth();
  }, []);

  // 自分の投稿でない場合は何も表示しない
  if (isLoading || !currentUserId || currentUserId !== postUserId) {
    return null;
  }

  return (
    <>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditModalOpen(true)}
        >
          <Edit className="mr-2 h-4 w-4" />
          編集
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDeleteDialogOpen(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          投稿を取り消す
        </Button>
      </div>

      {/* 編集モーダル */}
      <EditPostModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        imageId={postId}
        currentCaption={currentCaption}
      />

      {/* 削除ダイアログ */}
      <DeletePostDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        imageId={postId}
        imageUrl={imageUrl}
      />
    </>
  );
}

