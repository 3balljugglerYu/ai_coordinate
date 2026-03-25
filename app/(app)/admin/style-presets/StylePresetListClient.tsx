"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { StylePresetForm } from "./StylePresetForm";
import type { StylePresetAdmin } from "@/features/style-presets/lib/schema";

interface SortableStylePresetCardProps {
  preset: StylePresetAdmin;
  onEdit: (preset: StylePresetAdmin) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

function SortableStylePresetCard({
  preset,
  onEdit,
  onDelete,
  isDeleting,
}: SortableStylePresetCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: preset.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-row items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-2 sm:gap-3 ${
        isDragging ? "z-10 opacity-50 shadow-lg" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded p-2 -ml-2 transition-colors hover:bg-slate-200/60 cursor-grab active:cursor-grabbing touch-none"
          aria-label="ドラッグして並び替え"
        >
          <GripVertical className="h-5 w-5 text-slate-500" aria-hidden />
        </button>
        <div className="relative h-[112px] w-[84px] shrink-0 overflow-hidden rounded bg-slate-100">
          <Image
            src={preset.thumbnailImageUrl}
            alt={preset.title}
            fill
            className="object-cover object-top"
            sizes="84px"
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-slate-900">
              {preset.title}
            </p>
            <Badge variant={preset.status === "published" ? "default" : "secondary"}>
              {preset.status === "published" ? "公開" : "下書き"}
            </Badge>
            <Badge
              variant={
                preset.backgroundPrompt?.trim() ? "outline" : "secondary"
              }
            >
              {preset.backgroundPrompt?.trim()
                ? "背景変更対応"
                : "背景変更なし"}
            </Badge>
          </div>
          <p className="line-clamp-2 text-xs text-slate-600">
            {preset.stylingPrompt}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>表示順: {preset.sortOrder}</span>
            <span>
              サイズ: {preset.thumbnailWidth} x {preset.thumbnailHeight}
            </span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex sm:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="min-h-[44px] min-w-[44px] cursor-pointer"
                aria-label="操作メニュー"
              >
                <MoreVertical className="h-5 w-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[140px]">
              <DropdownMenuItem onClick={() => onEdit(preset)}>
                <Pencil className="mr-2 h-4 w-4" aria-hidden />
                編集
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(preset.id)}
                disabled={isDeleting}
                className="text-red-600 focus:text-red-700"
              >
                {isDeleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                )}
                削除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="hidden gap-2 sm:flex">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onEdit(preset)}
            className="min-h-[44px] min-w-[44px] cursor-pointer"
            aria-label="編集"
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onDelete(preset.id)}
            disabled={isDeleting}
            className="min-h-[44px] min-w-[44px] cursor-pointer text-red-600 hover:bg-red-50 hover:text-red-700"
            aria-label="削除"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

const pointerSensorOptions = {
  activationConstraint: { distance: 8 },
};

interface StylePresetListClientProps {
  initialPresets: StylePresetAdmin[];
}

export function StylePresetListClient({
  initialPresets,
}: StylePresetListClientProps) {
  const [presets, setPresets] = useState<StylePresetAdmin[]>(initialPresets);
  const [editingPreset, setEditingPreset] = useState<StylePresetAdmin | null>(
    null
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, pointerSensorOptions),
    useSensor(KeyboardSensor)
  );

  const reload = useCallback(async () => {
    const response = await fetch("/api/admin/style-presets");
    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as StylePresetAdmin[];
    setPresets(data);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }

      const oldIndex = presets.findIndex((preset) => preset.id === active.id);
      const newIndex = presets.findIndex((preset) => preset.id === over.id);
      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      const reordered = arrayMove(presets, oldIndex, newIndex);
      setPresets(reordered);
      setIsReordering(true);

      try {
        const response = await fetch("/api/admin/style-presets/reorder", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            order: reordered.map((preset) => preset.id),
          }),
        });
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error(body?.error || "表示順の更新に失敗しました");
        }

        await reload();
        toast({
          title: "表示順を更新しました",
          description: "スタイルの並び順を保存しました",
        });
      } catch (error) {
        toast({
          title: "エラー",
          description:
            error instanceof Error
              ? error.message
              : "表示順の更新に失敗しました",
          variant: "destructive",
        });
        try {
          await reload();
        } catch (reloadError) {
          console.error("[Admin Style Presets] reload error:", reloadError);
        }
      } finally {
        setIsReordering(false);
      }
    },
    [presets, reload, toast]
  );

  const requestDelete = useCallback((id: string) => {
    setDeleteConfirmId(id);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteConfirmId) {
      return;
    }

    setDeletingId(deleteConfirmId);
    try {
      const response = await fetch(`/api/admin/style-presets/${deleteConfirmId}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error || "削除に失敗しました");
      }

      toast({
        title: "削除しました",
        description: "スタイルを削除しました",
      });
      setDeleteConfirmId(null);
      await reload();
    } catch (error) {
      toast({
        title: "エラー",
        description:
          error instanceof Error ? error.message : "削除に失敗しました",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  }, [deleteConfirmId, reload, toast]);

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">
              スタイル一覧
            </h2>
            <p className="text-sm text-slate-600">
              画像・タイトル・styling/background prompt・公開状態を管理し、ドラッグで表示順を変更できます。
            </p>
          </div>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="min-h-[44px] cursor-pointer"
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            新規追加
          </Button>
        </div>

        {presets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center text-sm text-slate-500">
            スタイルがまだ登録されていません。
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={presets.map((preset) => preset.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {presets.map((preset) => (
                  <SortableStylePresetCard
                    key={preset.id}
                    preset={preset}
                    onEdit={setEditingPreset}
                    onDelete={requestDelete}
                    isDeleting={deletingId === preset.id}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {isReordering ? (
          <p className="text-xs text-slate-500">表示順を保存しています...</p>
        ) : null}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="h-[90dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto sm:h-auto sm:max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>スタイルを追加</DialogTitle>
          </DialogHeader>
          <StylePresetForm
            onSuccess={async () => {
              setIsCreateOpen(false);
              await reload();
            }}
            onCancel={() => setIsCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingPreset !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingPreset(null);
          }
        }}
      >
        <DialogContent className="h-[90dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto sm:h-auto sm:max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>スタイルを編集</DialogTitle>
          </DialogHeader>
          {editingPreset ? (
            <StylePresetForm
              preset={editingPreset}
              onSuccess={async () => {
                setEditingPreset(null);
                await reload();
              }}
              onCancel={() => setEditingPreset(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>スタイルを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              削除したスタイルは /style に表示されなくなります。関連する Storage
              画像も削除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
