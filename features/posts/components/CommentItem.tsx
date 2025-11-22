"use client";

import { useState } from "react";
import Image from "next/image";
import { User, MoreVertical, Edit, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { updateCommentAPI, deleteCommentAPI } from "../lib/api";
import { useToast } from "@/components/ui/use-toast";

interface CommentItemProps {
  comment: {
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    updated_at: string;
  };
  currentUserId?: string | null;
  onCommentUpdated: () => void;
  onCommentDeleted: () => void;
}

const MAX_LENGTH = 200;

/**
 * コメントアイテムコンポーネント
 * インライン編集と削除機能を実装
 */
export function CommentItem({
  comment,
  currentUserId,
  onCommentUpdated,
  onCommentDeleted,
}: CommentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { toast } = useToast();

  const isOwner = currentUserId === comment.user_id;

  const handleEdit = () => {
    setIsEditing(true);
    setEditContent(comment.content);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(comment.content);
  };

  const handleSaveEdit = async () => {
    const trimmedContent = editContent.trim();
    if (trimmedContent.length === 0) {
      toast({
        title: "コメントを入力してください",
        description: "空のコメントは保存できません",
        variant: "destructive",
      });
      return;
    }

    if (trimmedContent.length > MAX_LENGTH) {
      toast({
        title: "文字数制限を超えています",
        description: `コメントは${MAX_LENGTH}文字以内で入力してください`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await updateCommentAPI(comment.id, trimmedContent);
      setIsEditing(false);
      onCommentUpdated();
    } catch (error) {
      toast({
        title: "エラー",
        description:
          error instanceof Error
            ? error.message
            : "コメントの編集に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteCommentAPI(comment.id);
      setDeleteDialogOpen(false);
      onCommentDeleted();
    } catch (error) {
      toast({
        title: "エラー",
        description:
          error instanceof Error
            ? error.message
            : "コメントの削除に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const displayName = comment.user_id.slice(0, 8);
  const remainingChars = MAX_LENGTH - editContent.length;

  return (
    <>
      <div className="flex gap-3 py-3">
        {/* ユーザーアイコン */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200">
          <User className="h-4 w-4 text-gray-500" />
        </div>

        <div className="min-w-0 flex-1">
          {/* ユーザー名と日時 */}
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              {displayName}
            </span>
            <span className="text-xs text-gray-500">
              {new Date(comment.created_at).toLocaleDateString("ja-JP", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {/* コメント内容 */}
          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                maxLength={MAX_LENGTH}
                rows={3}
                className="resize-none text-sm"
                disabled={isLoading}
              />
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs ${
                    remainingChars < 20 ? "text-red-500" : "text-gray-500"
                  }`}
                >
                  {remainingChars}文字
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelEdit}
                    disabled={isLoading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={isLoading || editContent.trim().length === 0}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
              {comment.content}
            </p>
          )}
        </div>

        {/* 3点メニュー（所有者のみ） */}
        {isOwner && !isEditing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEdit}>
                <Edit className="mr-2 h-4 w-4" />
                編集
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDeleteDialogOpen(true)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                削除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* 削除確認ダイアログ */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>コメントを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は取り消せません。コメントが完全に削除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "削除中..." : "削除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

