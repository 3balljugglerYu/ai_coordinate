"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  BarChart3,
  Eye,
  FileEdit,
  GripVertical,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
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
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { PopupBannerAnalyticsChart } from "@/features/popup-banners/components/PopupBannerAnalyticsChart";
import type {
  PopupBanner,
  PopupBannerAnalyticsPoint,
} from "@/features/popup-banners/lib/schema";
import { PopupBannerForm } from "./PopupBannerForm";

type PopupBannerDisplayStatus = "draft" | "scheduled" | "live" | "ended";
type AnalyticsRange = "7d" | "30d" | "custom";

const pointerSensorOptions = {
  activationConstraint: { distance: 8 },
};

function getPopupBannerDisplayStatus(
  banner: PopupBanner
): PopupBannerDisplayStatus {
  if (banner.status === "draft") {
    return "draft";
  }

  const now = new Date();
  const start = banner.display_start_at ? new Date(banner.display_start_at) : null;
  const end = banner.display_end_at ? new Date(banner.display_end_at) : null;

  if (start && start > now) {
    return "scheduled";
  }

  if (end && end <= now) {
    return "ended";
  }

  return "live";
}

function formatDateTime(value: string | null, fallback: string) {
  return value
    ? new Date(value).toLocaleString("ja-JP", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : fallback;
}

function formatDateInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const STATUS_CONFIG: Record<
  PopupBannerDisplayStatus,
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
    icon: <ShieldCheck className="size-3" aria-hidden />,
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
    label: "終了",
    icon: <FileEdit className="size-3" aria-hidden />,
    className:
      "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700",
  },
};

function PopupBannerStatusBadge({
  status,
}: {
  status: PopupBannerDisplayStatus;
}) {
  const config = STATUS_CONFIG[status];

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-medium transition-colors duration-200",
        config.className
      )}
    >
      {config.icon}
      {config.label}
    </Badge>
  );
}

interface SortablePopupBannerCardProps {
  banner: PopupBanner;
  isDeleting: boolean;
  isSelected: boolean;
  onEdit: (banner: PopupBanner) => void;
  onDelete: (id: string) => void;
  onSelectAnalytics: (id: string) => void;
}

function SortablePopupBannerCard({
  banner,
  isDeleting,
  isSelected,
  onEdit,
  onDelete,
  onSelectAnalytics,
}: SortablePopupBannerCardProps) {
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

  const status = getPopupBannerDisplayStatus(banner);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 sm:gap-4 sm:p-4",
        isDragging && "z-10 opacity-50 shadow-lg",
        isSelected && "border-violet-300 bg-violet-50/70"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded p-2 transition-colors hover:bg-slate-200/60"
          aria-label="ドラッグして並び替え"
        >
          <GripVertical className="h-5 w-5 text-slate-500" aria-hidden />
        </button>

        <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-200/70">
          <Image
            src={banner.image_url}
            alt={banner.alt}
            fill
            className="object-cover"
            sizes="64px"
          />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <PopupBannerStatusBadge status={status} />
            {banner.show_once_only && (
              <Badge
                variant="secondary"
                className="bg-emerald-100 text-emerald-800"
              >
                次回から非表示可
              </Badge>
            )}
          </div>

          <p className="truncate text-sm font-medium text-slate-900">
            {banner.link_url || "リンクなし"}
          </p>
          <p className="text-xs text-slate-500">{banner.alt}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>
              {formatDateTime(banner.display_start_at, "即時")}〜
              {formatDateTime(banner.display_end_at, "無期限")}
            </span>
            <span>順位: {banner.display_order}</span>
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
            <DropdownMenuContent align="end" className="min-w-[160px]">
              <DropdownMenuItem onClick={() => onSelectAnalytics(banner.id)}>
                <BarChart3 className="mr-2 h-4 w-4" aria-hidden />
                分析を表示
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(banner)}>
                <Pencil className="mr-2 h-4 w-4" aria-hidden />
                編集
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete(banner.id)}
                disabled={isDeleting}
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

        <div className="hidden sm:flex sm:gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onSelectAnalytics(banner.id)}
            className="min-h-[44px] min-w-[44px] cursor-pointer"
            aria-label="分析を表示"
          >
            <BarChart3 className="h-4 w-4" aria-hidden />
          </Button>
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

function BannerListWithDnd({
  banners,
  deletingId,
  selectedAnalyticsBannerId,
  onEdit,
  onDelete,
  onDragEnd,
  onSelectAnalytics,
  sensors,
}: {
  banners: PopupBanner[];
  deletingId: string | null;
  selectedAnalyticsBannerId: string | null;
  onEdit: (banner: PopupBanner) => void;
  onDelete: (id: string) => void;
  onDragEnd: (event: DragEndEvent) => Promise<void>;
  onSelectAnalytics: (id: string) => void;
  sensors: ReturnType<typeof useSensors>;
}) {
  if (banners.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-slate-500">
        ポップアップバナーがありません。追加してください。
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
        items={banners.map((banner) => banner.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3">
          {banners.map((banner) => (
            <SortablePopupBannerCard
              key={banner.id}
              banner={banner}
              isDeleting={deletingId === banner.id}
              isSelected={selectedAnalyticsBannerId === banner.id}
              onEdit={onEdit}
              onDelete={onDelete}
              onSelectAnalytics={onSelectAnalytics}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface PopupBannerListClientProps {
  initialBanners: PopupBanner[];
}

export function PopupBannerListClient({
  initialBanners,
}: PopupBannerListClientProps) {
  const { toast } = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, pointerSensorOptions),
    useSensor(KeyboardSensor)
  );
  const [banners, setBanners] = useState(initialBanners);
  const [editingBanner, setEditingBanner] = useState<PopupBanner | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [selectedAnalyticsBannerId, setSelectedAnalyticsBannerId] = useState<
    string | null
  >(initialBanners[0]?.id ?? null);
  const [analyticsRange, setAnalyticsRange] = useState<AnalyticsRange>("7d");
  const [customStartDate, setCustomStartDate] = useState(
    formatDateInput(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000))
  );
  const [customEndDate, setCustomEndDate] = useState(formatDateInput(new Date()));
  const [analyticsData, setAnalyticsData] = useState<PopupBannerAnalyticsPoint[]>(
    []
  );
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);

  useEffect(() => {
    if (banners.length === 0) {
      setSelectedAnalyticsBannerId(null);
      return;
    }

    if (
      !selectedAnalyticsBannerId ||
      !banners.some((banner) => banner.id === selectedAnalyticsBannerId)
    ) {
      setSelectedAnalyticsBannerId(banners[0]?.id ?? null);
    }
  }, [banners, selectedAnalyticsBannerId]);

  useEffect(() => {
    if (!selectedAnalyticsBannerId) {
      setAnalyticsData([]);
      return;
    }

    if (
      analyticsRange === "custom" &&
      (!customStartDate || !customEndDate || customStartDate > customEndDate)
    ) {
      setAnalyticsData([]);
      return;
    }

    let cancelled = false;

    async function loadAnalytics() {
      setIsAnalyticsLoading(true);

      try {
        const params = new URLSearchParams();
        if (analyticsRange === "custom") {
          params.set("start", customStartDate);
          params.set("end", customEndDate);
        } else {
          params.set("days", analyticsRange === "30d" ? "30" : "7");
        }

        const response = await fetch(
          `/api/admin/popup-banners/${selectedAnalyticsBannerId}/analytics?${params.toString()}`,
          { cache: "no-store" }
        );
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "アナリティクスの取得に失敗しました");
        }

        if (!cancelled) {
          setAnalyticsData(payload as PopupBannerAnalyticsPoint[]);
        }
      } catch (error) {
        if (!cancelled) {
          setAnalyticsData([]);
          toast({
            title: "エラー",
            description:
              error instanceof Error
                ? error.message
                : "アナリティクスの取得に失敗しました",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) {
          setIsAnalyticsLoading(false);
        }
      }
    }

    void loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, [
    analyticsRange,
    customEndDate,
    customStartDate,
    selectedAnalyticsBannerId,
    toast,
  ]);

  async function reload() {
    const response = await fetch("/api/admin/popup-banners", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("ポップアップバナー一覧の再取得に失敗しました");
    }

    const payload = (await response.json()) as PopupBanner[];
    setBanners(payload);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = banners.findIndex((banner) => banner.id === active.id);
    const newIndex = banners.findIndex((banner) => banner.id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const reordered = arrayMove(banners, oldIndex, newIndex);
    setBanners(reordered);
    setIsReordering(true);

    try {
      const response = await fetch("/api/admin/popup-banners/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: reordered.map((banner) => banner.id) }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "表示順の更新に失敗しました");
      }

      toast({
        title: "表示順を更新しました",
        description: "ポップアップバナーの並び順を保存しました",
      });
    } catch (error) {
      toast({
        title: "エラー",
        description:
          error instanceof Error ? error.message : "表示順の更新に失敗しました",
        variant: "destructive",
      });
      try {
        await reload();
      } catch {
        // noop
      }
    } finally {
      setIsReordering(false);
    }
  }

  async function handleDeleteConfirm() {
    const id = deleteConfirmId;
    if (!id) {
      return;
    }

    setDeleteConfirmId(null);
    setDeletingId(id);

    try {
      const response = await fetch(`/api/admin/popup-banners/${id}`, {
        method: "DELETE",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "削除に失敗しました");
      }

      const nextBanners = banners.filter((banner) => banner.id !== id);
      setBanners(nextBanners);
      toast({
        title: "削除しました",
        description: "ポップアップバナーを削除しました",
      });
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "削除に失敗しました",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleFormSuccess() {
    setEditingBanner(null);
    setIsCreateOpen(false);

    try {
      await reload();
    } catch (error) {
      toast({
        title: "エラー",
        description:
          error instanceof Error
            ? error.message
            : "ポップアップバナー一覧の再取得に失敗しました",
        variant: "destructive",
      });
    }
  }

  const selectedAnalyticsBanner =
    banners.find((banner) => banner.id === selectedAnalyticsBannerId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="min-h-[44px] w-full cursor-pointer sm:w-auto"
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          ポップアップバナーを追加
        </Button>
      </div>

      {isReordering && (
        <p className="text-sm text-slate-500">表示順を更新しています...</p>
      )}

      <p className="text-xs text-slate-500">
        カード左端のグリップをドラッグすると表示優先順位を変更できます。
      </p>

      <BannerListWithDnd
        banners={banners}
        deletingId={deletingId}
        selectedAnalyticsBannerId={selectedAnalyticsBannerId}
        onEdit={setEditingBanner}
        onDelete={setDeleteConfirmId}
        onDragEnd={handleDragEnd}
        onSelectAnalytics={setSelectedAnalyticsBannerId}
        sensors={sensors}
      />

      <div className="rounded-xl border border-slate-200 bg-white/95 p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              バナー別アナリティクス
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              表示、クリック、閉じる、次回から非表示の件数を日別で確認できます。
            </p>
            {selectedAnalyticsBanner && (
              <p className="mt-2 text-sm font-medium text-slate-700">
                対象: {selectedAnalyticsBanner.alt}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={analyticsRange === "7d" ? "default" : "outline"}
              onClick={() => setAnalyticsRange("7d")}
              className="min-h-[40px] cursor-pointer"
            >
              過去7日
            </Button>
            <Button
              type="button"
              variant={analyticsRange === "30d" ? "default" : "outline"}
              onClick={() => setAnalyticsRange("30d")}
              className="min-h-[40px] cursor-pointer"
            >
              過去30日
            </Button>
            <Button
              type="button"
              variant={analyticsRange === "custom" ? "default" : "outline"}
              onClick={() => setAnalyticsRange("custom")}
              className="min-h-[40px] cursor-pointer"
            >
              カスタム
            </Button>
          </div>
        </div>

        {analyticsRange === "custom" && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                開始日
              </label>
              <Input
                type="date"
                value={customStartDate}
                onChange={(event) => setCustomStartDate(event.target.value)}
                className="min-h-[44px]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                終了日
              </label>
              <Input
                type="date"
                value={customEndDate}
                onChange={(event) => setCustomEndDate(event.target.value)}
                className="min-h-[44px]"
              />
            </div>
          </div>
        )}

        <div className="mt-5">
          {!selectedAnalyticsBanner ? (
            <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500 sm:h-[320px]">
              分析対象のバナーがありません。
            </div>
          ) : isAnalyticsLoading ? (
            <div className="flex h-[260px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50/70 text-sm text-slate-500 sm:h-[320px]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              アナリティクスを読み込み中です...
            </div>
          ) : (
            <PopupBannerAnalyticsChart data={analyticsData} />
          )}
        </div>
      </div>

      <Dialog open={!!editingBanner} onOpenChange={(open) => !open && setEditingBanner(null)}>
        <DialogContent className="h-[90dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto sm:h-auto sm:max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>ポップアップバナーを編集</DialogTitle>
          </DialogHeader>
          {editingBanner && (
            <PopupBannerForm
              banner={editingBanner}
              onSuccess={() => void handleFormSuccess()}
              onCancel={() => setEditingBanner(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="h-[90dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto sm:h-auto sm:max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>ポップアップバナーを追加</DialogTitle>
          </DialogHeader>
          <PopupBannerForm
            onSuccess={() => void handleFormSuccess()}
            onCancel={() => setIsCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ポップアップバナーを削除</AlertDialogTitle>
            <AlertDialogDescription>
              このポップアップバナーを削除しますか？この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmId(null)}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteConfirm()}
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
