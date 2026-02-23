"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
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
import { useToast } from "@/components/ui/use-toast";
import { Pencil, Trash2, Plus, Loader2, GripVertical, MoreVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MaterialImageForm } from "./MaterialImageForm";
import type { MaterialPageImage } from "@/features/materials-images/lib/schema";

interface SortableMaterialImageCardProps {
  image: MaterialPageImage;
  onEdit: (image: MaterialPageImage) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

function SortableMaterialImageCard({
  image,
  onEdit,
  onDelete,
  isDeleting,
}: SortableMaterialImageCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-row items-center gap-2 sm:gap-3 rounded-lg border border-slate-200/80 bg-slate-50/50 py-2 px-3 ${
        isDragging ? "opacity-50 shadow-lg z-10" : ""
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 p-2 -ml-2 rounded cursor-grab active:cursor-grabbing touch-none hover:bg-slate-200/60 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="ドラッグして並び替え"
        >
          <GripVertical className="h-5 w-5 text-slate-500" aria-hidden />
        </button>
        <div className="relative h-14 w-20 sm:h-16 sm:w-32 shrink-0 overflow-hidden rounded bg-slate-50/50 flex items-center justify-center">
          <Image
            src={image.image_url}
            alt={image.alt}
            fill
            className="object-contain"
            sizes="(max-width: 640px) 80px, 128px"
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-slate-900 truncate">
            {image.alt}
          </p>
          <span className="text-xs text-slate-500">
            表示順: {image.display_order}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
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
              <DropdownMenuItem onClick={() => onEdit(image)}>
                <Pencil className="h-4 w-4 mr-2" aria-hidden />
                編集
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(image.id)}
                disabled={isDeleting}
                className="text-red-600 focus:text-red-700"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" aria-hidden />
                )}
                削除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="hidden sm:flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onEdit(image)}
            className="min-h-[44px] min-w-[44px] cursor-pointer"
            aria-label="編集"
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onDelete(image.id)}
            disabled={isDeleting}
            className="min-h-[44px] min-w-[44px] cursor-pointer text-red-600 hover:text-red-700 hover:bg-red-50"
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

interface MaterialImageListClientProps {
  slug: string;
  initialImages: MaterialPageImage[];
}

export function MaterialImageListClient({
  slug,
  initialImages,
}: MaterialImageListClientProps) {
  const [images, setImages] = useState<MaterialPageImage[]>(initialImages);
  const [editingImage, setEditingImage] = useState<MaterialPageImage | null>(
    null
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, pointerSensorOptions),
    useSensor(KeyboardSensor)
  );

  const reload = useCallback(async () => {
    const res = await fetch(`/api/admin/materials-images/${slug}`);
    if (res.ok) {
      const data = (await res.json()) as MaterialPageImage[];
      setImages(data);
    }
  }, [slug]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = images.findIndex((i) => i.id === active.id);
      const newIndex = images.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const newList = arrayMove(images, oldIndex, newIndex);
      setImages(newList);

      setIsReordering(true);
      try {
        const res = await fetch(
          `/api/admin/materials-images/${slug}/reorder`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order: newList.map((i) => i.id),
            }),
          }
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "表示順の更新に失敗しました");
        }
        toast({
          title: "表示順を更新しました",
          description: "画像の並び順を保存しました",
        });
        void reload();
      } catch (error) {
        toast({
          title: "エラー",
          description:
            error instanceof Error
              ? error.message
              : "表示順の更新に失敗しました",
          variant: "destructive",
        });
        void reload();
      } finally {
        setIsReordering(false);
      }
    },
    [images, slug, toast, reload]
  );

  const handleEdit = (image: MaterialPageImage) => {
    setEditingImage(image);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteConfirmId(id);
  };

  const handleDeleteConfirm = async () => {
    const id = deleteConfirmId;
    if (!id) return;
    setDeleteConfirmId(null);
    setDeletingId(id);
    try {
      const res = await fetch(
        `/api/admin/materials-images/${slug}/${id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "削除に失敗しました");
      }
      setImages((prev) => prev.filter((i) => i.id !== id));
      toast({ title: "削除しました", description: "画像を削除しました" });
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
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmId(null);
  };

  const handleFormSuccess = () => {
    setEditingImage(null);
    setIsCreateOpen(false);
    void reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="min-h-[44px] w-full sm:w-auto cursor-pointer"
          aria-label="画像を追加"
        >
          <Plus className="h-4 w-4 mr-2" aria-hidden />
          画像を追加
        </Button>
      </div>

      {images.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-600">
          画像がありません。追加してください。
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-2">
            各カード左端のグリップをドラッグして表示順を変更できます
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={images.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
              disabled={isReordering}
            >
              <div className="space-y-1.5">
                {images.map((image) => (
                  <SortableMaterialImageCard
                    key={image.id}
                    image={image}
                    onEdit={handleEdit}
                    onDelete={handleDeleteClick}
                    isDeleting={deletingId === image.id}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      <Dialog
        open={!!editingImage}
        onOpenChange={(o) => !o && setEditingImage(null)}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl h-[90dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>画像を編集</DialogTitle>
          </DialogHeader>
          {editingImage && (
            <MaterialImageForm
              slug={slug}
              image={editingImage}
              onSuccess={handleFormSuccess}
              onCancel={() => setEditingImage(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl h-[90dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>画像を追加</DialogTitle>
          </DialogHeader>
          <MaterialImageForm
            slug={slug}
            onSuccess={handleFormSuccess}
            onCancel={() => setIsCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && handleDeleteCancel()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>画像を削除</AlertDialogTitle>
            <AlertDialogDescription>
              この画像を削除しますか？この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
