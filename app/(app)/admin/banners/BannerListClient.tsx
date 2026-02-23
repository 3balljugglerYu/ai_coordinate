"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  Pencil,
  Trash2,
  Plus,
  Loader2,
  GripVertical,
  Eye,
  Clock,
  CalendarCheck,
  FileEdit,
  MoreVertical,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BannerForm } from "./BannerForm";
import { BannerPreview } from "./BannerPreview";
import type { Banner } from "@/features/banners/lib/schema";

/** バナーの表示状態: 下書き | 公開前 | 公開中 | 公開済み */
type BannerDisplayStatus = "draft" | "scheduled" | "live" | "ended";

function getBannerDisplayStatus(banner: Banner): BannerDisplayStatus {
  if (banner.status === "draft") return "draft";

  const now = new Date();
  const start = banner.display_start_at
    ? new Date(banner.display_start_at)
    : null;
  const end = banner.display_end_at ? new Date(banner.display_end_at) : null;

  if (start && start > now) return "scheduled";
  if (end && end <= now) return "ended";
  return "live";
}

interface BannerListClientProps {
  initialBanners: Banner[];
}

const STATUS_CONFIG: Record<
  BannerDisplayStatus,
  { label: string; icon: React.ReactNode; className: string }
> = {
  draft: {
    label: "下書き",
    icon: <FileEdit className="size-3" aria-hidden />,
    className:
      "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  },
  scheduled: {
    label: "公開前",
    icon: <Clock className="size-3" aria-hidden />,
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800",
  },
  live: {
    label: "公開中",
    icon: <Eye className="size-3" aria-hidden />,
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800",
  },
  ended: {
    label: "公開済み",
    icon: <CalendarCheck className="size-3" aria-hidden />,
    className:
      "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700",
  },
};

function BannerStatusBadge({ status }: { status: BannerDisplayStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-medium transition-colors duration-200",
        config.className
      )}
      aria-label={`ステータス: ${config.label}`}
    >
      {config.icon}
      {config.label}
    </Badge>
  );
}

interface SortableBannerCardProps {
  banner: Banner;
  onEdit: (banner: Banner) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

function SortableBannerCard({
  banner,
  onEdit,
  onDelete,
  isDeleting,
}: SortableBannerCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: banner.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const status = getBannerDisplayStatus(banner);
  const formatDate = (d: string | null, fallback: string) =>
    d
      ? new Date(d).toLocaleString("ja-JP", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : fallback;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-row items-center gap-3 sm:gap-4 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 sm:p-4 ${
        isDragging ? "opacity-50 shadow-lg z-10" : ""
      }`}
    >
      {/* グリップ + 画像 + コンテンツ + 操作 */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 p-2 -ml-2 rounded cursor-grab active:cursor-grabbing touch-none hover:bg-slate-200/60 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="ドラッグして並び替え"
        >
          <GripVertical className="h-5 w-5 text-slate-500" aria-hidden />
        </button>
        <div className="relative h-14 w-20 sm:h-16 sm:w-32 shrink-0 overflow-hidden rounded bg-slate-200/60 aspect-video sm:aspect-auto">
          <Image
            src={banner.image_url}
            alt={banner.alt}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 80px, 128px"
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-slate-900 truncate">
            {banner.link_url}
          </p>
          {(banner.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(banner.tags ?? []).slice(0, 2).map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-xs font-normal bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-400 dark:border-violet-800"
                >
                  {tag}
                </Badge>
              ))}
              {(banner.tags ?? []).length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{(banner.tags ?? []).length - 2}
                </Badge>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <BannerStatusBadge status={status} />
            <span className="text-xs text-slate-500">
              {formatDate(banner.display_start_at, "即時")}～
              {formatDate(banner.display_end_at, "無期限")}
              <span className="hidden sm:inline"> · 順位: {banner.display_order}</span>
            </span>
          </div>
        </div>
      </div>
      {/* 操作ボタン（グリップ・画像・コンテンツと同一行で垂直中央揃え） */}
      <div className="flex items-center gap-2 shrink-0">
        {/* モバイル: ドロップダウンメニューで省スペース */}
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
              <DropdownMenuItem onClick={() => onEdit(banner)}>
                <Pencil className="h-4 w-4 mr-2" aria-hidden />
                編集
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(banner.id)}
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
        {/* PC: 編集・削除ボタン */}
        <div className="hidden sm:flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onEdit(banner)}
            className="min-h-[44px] min-w-[44px] cursor-pointer"
            aria-label="編集"
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onDelete(banner.id)}
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

interface BannerListWithDndProps {
  banners: Banner[];
  onEdit: (banner: Banner) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => void | Promise<void>;
  isReordering: boolean;
}

function BannerListWithDnd({
  banners,
  onEdit,
  onDelete,
  deletingId,
  sensors,
  onDragEnd,
  isReordering,
}: BannerListWithDndProps) {
  if (banners.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        該当するバナーはありません
      </p>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={banners.map((b) => b.id)}
        strategy={verticalListSortingStrategy}
        disabled={isReordering}
      >
        <div className="space-y-3">
          {banners.map((banner) => (
            <SortableBannerCard
              key={banner.id}
              banner={banner}
              onEdit={onEdit}
              onDelete={onDelete}
              isDeleting={deletingId === banner.id}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export function BannerListClient({ initialBanners }: BannerListClientProps) {
  const [banners, setBanners] = useState<Banner[]>(initialBanners);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, pointerSensorOptions),
    useSensor(KeyboardSensor)
  );

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/banners");
    if (res.ok) {
      const data = (await res.json()) as Banner[];
      setBanners(data);
    }
  }, []);

  const createHandleDragEnd = useCallback(
    (
      list: Banner[],
      setNewOrder: (reordered: Banner[]) => void
    ) =>
      async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = list.findIndex((b) => b.id === active.id);
        const newIndex = list.findIndex((b) => b.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        const newList = arrayMove(list, oldIndex, newIndex);
        setNewOrder(newList);

        setIsReordering(true);
        try {
          const res = await fetch("/api/admin/banners/reorder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order: newList.map((b) => b.id),
            }),
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "表示順の更新に失敗しました");
          }
          toast({
            title: "表示順を更新しました",
            description: "バナーの並び順を保存しました",
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
    [toast, reload]
  );

  const handleEdit = (banner: Banner) => {
    setEditingBanner(banner);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このバナーを削除しますか？")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/banners/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "削除に失敗しました");
      }
      setBanners((prev) => prev.filter((b) => b.id !== id));
      toast({ title: "削除しました", description: "バナーを削除しました" });
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "削除に失敗しました",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleFormSuccess = () => {
    setEditingBanner(null);
    setIsCreateOpen(false);
    void reload();
  };

  const activeBanners = banners.filter(
    (b) => getBannerDisplayStatus(b) !== "ended"
  );
  const endedBanners = banners.filter(
    (b) => getBannerDisplayStatus(b) === "ended"
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="min-h-[44px] w-full sm:w-auto cursor-pointer"
          aria-label="バナーを追加"
        >
          <Plus className="h-4 w-4 mr-2" aria-hidden />
          バナーを追加
        </Button>
      </div>

      {banners.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-600">
          バナーがありません。追加してください。
        </p>
      ) : (
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="mb-4 w-full grid grid-cols-2 h-11 min-h-[44px] items-stretch [&>button]:h-full">
            <TabsTrigger value="active" className="text-sm sm:text-base">
              運用中 ({activeBanners.length})
            </TabsTrigger>
            <TabsTrigger value="ended" className="text-sm sm:text-base">
              公開済み ({endedBanners.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="active">
            <p className="text-xs text-slate-500 mb-2">
              各カード左端のグリップをドラッグして表示順を変更できます
            </p>
            <BannerListWithDnd
              banners={activeBanners}
              onEdit={handleEdit}
              onDelete={handleDelete}
              deletingId={deletingId}
              sensors={sensors}
              onDragEnd={createHandleDragEnd(activeBanners, (newActive) =>
                setBanners([...newActive, ...endedBanners])
              )}
              isReordering={isReordering}
            />
          </TabsContent>
          <TabsContent value="ended">
            <p className="text-xs text-slate-500 mb-2">
              表示期間が終了したバナーです。編集で期間を延長すると運用中に戻ります。
            </p>
            <BannerListWithDnd
              banners={endedBanners}
              onEdit={handleEdit}
              onDelete={handleDelete}
              deletingId={deletingId}
              sensors={sensors}
              onDragEnd={createHandleDragEnd(endedBanners, (newEnded) =>
                setBanners([...activeBanners, ...newEnded])
              )}
              isReordering={isReordering}
            />
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={!!editingBanner} onOpenChange={(o) => !o && setEditingBanner(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl h-[90dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>バナーを編集</DialogTitle>
          </DialogHeader>
          {editingBanner && (
            <BannerForm
              banner={editingBanner}
              onSuccess={handleFormSuccess}
              onCancel={() => setEditingBanner(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl h-[90dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>バナーを追加</DialogTitle>
          </DialogHeader>
          <BannerForm
            onSuccess={handleFormSuccess}
            onCancel={() => setIsCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
