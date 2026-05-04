"use client";

import {
  useEffect,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
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
import { deleteCommentAPI, updateCommentAPI } from "../lib/api";
import type { ParentComment, ReplyComment } from "../types";
import { useToast } from "@/components/ui/use-toast";
import { CollapsibleText } from "./CollapsibleText";
import { REPLY_PANEL_MOBILE_BREAKPOINT } from "../lib/constants";
import { cn, sanitizeProfileText, validateProfileText } from "@/lib/utils";
import { COMMENT_MAX_LENGTH } from "@/constants";

type DisplayComment = ParentComment | ReplyComment;

interface EditableCommentProps {
  comment: DisplayComment;
  currentUserId?: string | null;
  onCommentUpdated: () => void;
  onCommentDeleted: () => void;
  onCommentSelected?: () => void;
}

export function EditableComment({
  comment,
  currentUserId,
  onCommentUpdated,
  onCommentDeleted,
  onCommentSelected,
}: EditableCommentProps) {
  const t = useTranslations("posts");
  const locale = useLocale();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { toast } = useToast();

  const isDeleted = Boolean(comment.deleted_at);
  const isOwner = !isDeleted && currentUserId === comment.user_id;
  const displayName = isDeleted
    ? ""
    : comment.user_nickname ||
      comment.user_id?.slice(0, 8) ||
      t("anonymousUser");
  const remainingChars = COMMENT_MAX_LENGTH - editContent.length;
  const isSelectable = Boolean(onCommentSelected) && !isEditing && !isDeleted;

  useEffect(() => {
    setEditContent(comment.content);
  }, [comment.content]);

  const handleEdit = () => {
    setIsEditing(true);
    setEditContent(comment.content);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(comment.content);
  };

  const handleSaveEdit = async () => {
    const sanitized = sanitizeProfileText(editContent);
    const validation = validateProfileText(
      sanitized.value,
      COMMENT_MAX_LENGTH,
      "comment",
      false,
      {
        required: t("commentRequired"),
        invalidCharacters: t("commentInvalidCharacters"),
        maxLength: t("commentTooLong", { max: COMMENT_MAX_LENGTH }),
      },
    );

    if (!validation.valid) {
      toast({
        title: t("errorTitle"),
        description: validation.error || t("commentCreateFailed"),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await updateCommentAPI(comment.id, sanitized.value, {
        commentUpdateFailed: t("commentUpdateFailed"),
      });
      setIsEditing(false);
      onCommentUpdated();
    } catch (error) {
      toast({
        title: t("errorTitle"),
        description:
          error instanceof Error ? error.message : t("commentUpdateFailed"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteCommentAPI(comment.id, {
        commentDeleteFailed: t("commentDeleteFailed"),
      });
      setDeleteDialogOpen(false);
      onCommentDeleted();
    } catch (error) {
      toast({
        title: t("errorTitle"),
        description:
          error instanceof Error ? error.message : t("commentDeleteFailed"),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSelect = (target: EventTarget | null) => {
    if (
      !isSelectable ||
      window.innerWidth >= REPLY_PANEL_MOBILE_BREAKPOINT
    ) {
      return;
    }

    if (
      target instanceof HTMLElement &&
      target.closest("button, a, input, textarea, [role='menuitem']")
    ) {
      return;
    }

    onCommentSelected?.();
  };

  const handleSelectClick = (event: MouseEvent<HTMLDivElement>) => {
    handleSelect(event.target);
  };

  const handleSelectKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    handleSelect(event.target);
  };

  return (
    <>
      <div className="flex gap-3 py-3">
        <div
          role={isSelectable ? "button" : undefined}
          tabIndex={isSelectable ? 0 : -1}
          className={cn(
            "flex min-w-0 flex-1 gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isSelectable && "cursor-pointer md:cursor-default",
          )}
          onClick={handleSelectClick}
          onKeyDown={handleSelectKeyDown}
        >
          {!isDeleted &&
            (comment.user_avatar_url ? (
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
                <Image
                  src={comment.user_avatar_url}
                  alt={displayName}
                  fill
                  className="object-cover"
                  sizes="32px"
                />
              </div>
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200">
                <User className="h-4 w-4 text-gray-500" />
              </div>
            ))}

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              {!isDeleted && (
                <span className="text-sm font-medium text-gray-900">
                  {displayName}
                </span>
              )}
              <span className="text-xs text-gray-500">
                {new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(comment.created_at))}
              </span>
            </div>

            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  maxLength={COMMENT_MAX_LENGTH}
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
                    {t("commentRemaining", { count: remainingChars })}
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
              <CollapsibleText
                text={comment.content}
                maxLines={2}
                textClassName={
                  isDeleted ? "italic text-gray-500" : "text-gray-900"
                }
                linkify={!isDeleted}
              />
            )}
          </div>
        </div>

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
                {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDeleteDialogOpen(true)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("commentDeleteDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("commentDeleteDialogDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? t("commentDeleteDialogDeleting") : t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
