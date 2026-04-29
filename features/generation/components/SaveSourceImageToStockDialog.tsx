"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import {
  deleteSourceImageStock,
  getSourceImageStocks,
  linkSourceImageStockToJobs,
  type SourceImageStock,
} from "../lib/database";
import {
  readCoordinateStockSavePromptDismissed,
  writeCoordinateStockSavePromptDismissed,
} from "../lib/form-preferences";
import { normalizeSourceImage } from "../lib/normalize-source-image";
import { COORDINATE_STOCK_CREATED_EVENT } from "../hooks/useCoordinateStocksUnread";

interface SaveSourceImageToStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 拡大表示で見ていた生成結果の元画像 (upload 由来時のみ渡す) */
  originalFile: File;
  /** 同じ元画像で生成された jobId 群（保存後に source_image_stock_id を埋める対象） */
  jobIds: string[];
  /** ストック作成成功時のコールバック */
  onSaved?: (stockId: string) => void;
  /** 保存処理開始時のコールバック */
  onSaveStart?: () => void;
}

interface SaveStockResponse {
  id?: string;
  error?: string;
  errorCode?: string;
}

function isLimitReachedMessage(message: string): boolean {
  // 既存 SOURCE_IMAGE_LIMIT_REACHED では copy.stockLimitReached を返すが、
  // ja: 「ストックの上限...」/ en: 「You have reached...」のような形になるため、
  // 既存 GenerationForm 側のキーワード「上限」「limit」で判定するのに合わせる。
  const lower = message.toLowerCase();
  return message.includes("上限") || lower.includes("limit");
}

function SaveStockPromptIllustration({
  sourceImageUrl,
  sourceImageAlt,
}: {
  sourceImageUrl?: string;
  sourceImageAlt: string;
}) {
  return (
    <div className="mx-auto mb-2 aspect-square w-52 max-w-[72vw] sm:w-60">
      <div className="relative h-full w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/stock-save-prompt.webp"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />
        {sourceImageUrl ? (
          <div
            className="absolute"
            style={{
              left: "10.5%",
              top: "6.8%",
              width: "38%",
              height: "47%",
              transform: "rotate(-12deg)",
              transformOrigin: "center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sourceImageUrl}
              alt={sourceImageAlt}
              className="h-full w-full rounded-[14%] object-contain"
              draggable={false}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SaveSourceImageToStockDialog({
  open,
  onOpenChange,
  originalFile,
  jobIds,
  onSaved,
  onSaveStart,
}: SaveSourceImageToStockDialogProps) {
  const t = useTranslations("coordinate");
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLimitReached, setIsLimitReached] = useState(false);
  const [dismissedPromptChecked, setDismissedPromptChecked] = useState(false);
  const [isManagingStocks, setIsManagingStocks] = useState(false);
  const [stocksForManagement, setStocksForManagement] = useState<
    SourceImageStock[]
  >([]);
  const [isLoadingStocksForManagement, setIsLoadingStocksForManagement] =
    useState(false);
  const [stockManagementError, setStockManagementError] = useState<
    string | null
  >(null);
  const [deletingStockId, setDeletingStockId] = useState<string | null>(null);
  const [sourceImagePreviewUrl, setSourceImagePreviewUrl] =
    useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setIsLimitReached(false);
    setDismissedPromptChecked(readCoordinateStockSavePromptDismissed());
    setIsManagingStocks(false);
    setStocksForManagement([]);
    setStockManagementError(null);
    setDeletingStockId(null);
  }, [open, originalFile, jobIds]);

  useEffect(() => {
    const previewUrl = URL.createObjectURL(originalFile);
    setSourceImagePreviewUrl(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [originalFile]);

  const handleSave = async () => {
    setError(null);
    setIsLimitReached(false);
    setIsSaving(true);
    onSaveStart?.();
    try {
      const normalizedFile = await normalizeSourceImage(originalFile, {
        imageLoadFailed: t("imageLoadFailed"),
        imageConvertFailed: t("imageConvertFailed"),
        imageContextUnavailable: t("imageContextUnavailable"),
      });
      const formData = new FormData();
      formData.append("file", normalizedFile);

      const res = await fetch("/api/source-image-stocks", {
        method: "POST",
        body: formData,
      });

      const contentType = res.headers.get("content-type");
      if (contentType?.includes("text/html")) {
        throw new Error(t("loginRequired"));
      }

      const data = (await res.json().catch(() => ({}))) as SaveStockResponse;

      if (!res.ok) {
        const message = data.error || t("saveStockFailed");
        if (
          data.errorCode === "SOURCE_IMAGE_LIMIT_REACHED" ||
          isLimitReachedMessage(message)
        ) {
          setIsLimitReached(true);
          setIsManagingStocks(false);
          return;
        }
        throw new Error(message);
      }

      if (!data.id) {
        throw new Error(t("saveStockFailed"));
      }

      // 別タブ / 他コンポーネントへ「ストックが新規追加された」と通知
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(COORDINATE_STOCK_CREATED_EVENT, {
            detail: { stockId: data.id },
          })
        );
      }

      // 関連 jobId を image_jobs / generated_images に紐づけ（best-effort）
      try {
        if (jobIds.length > 0) {
          await linkSourceImageStockToJobs(data.id, jobIds);
        }
      } catch (linkError) {
        console.warn(
          "[SaveSourceImageToStockDialog] link-stock failed:",
          linkError
        );
        toast({
          variant: "destructive",
          title: t("saveStockSucceeded"),
          description: t("linkStockFailed"),
        });
        onSaved?.(data.id);
        onOpenChange(false);
        return;
      }

      toast({
        title: t("saveStockSucceeded"),
      });
      onSaved?.(data.id);
      onOpenChange(false);
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : t("saveStockFailed");
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const loadStocksForManagement = async () => {
    setStockManagementError(null);
    setIsLoadingStocksForManagement(true);
    try {
      const stocks = await getSourceImageStocks(50, 0);
      setStocksForManagement(stocks);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : t("stockFetchFailed");
      setStockManagementError(message);
    } finally {
      setIsLoadingStocksForManagement(false);
    }
  };

  const handleRequestManageStocks = () => {
    setIsManagingStocks(true);
    void loadStocksForManagement();
  };

  const handleDeleteAndSave = async (stock: SourceImageStock) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(t("saveStockDeleteAndAddConfirm"))
    ) {
      return;
    }

    setStockManagementError(null);
    setDeletingStockId(stock.id);
    try {
      await deleteSourceImageStock(stock.id);
      setStocksForManagement((current) =>
        current.filter((item) => item.id !== stock.id)
      );
      await handleSave();
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : t("stockDeleteFailed");
      setStockManagementError(message);
    } finally {
      setDeletingStockId(null);
    }
  };

  const handleDismissPromptChange = (checked: boolean | "indeterminate") => {
    const nextChecked = checked === true;
    setDismissedPromptChecked(nextChecked);
    writeCoordinateStockSavePromptDismissed(nextChecked);
  };

  const title = isLimitReached
    ? t("saveStockLimitTitle")
    : t("saveStockDialogTitle");
  const description = isLimitReached
    ? t("saveStockLimitDescription")
    : t("saveStockDialogDescription");
  const isBusy =
    isSaving || isLoadingStocksForManagement || deletingStockId !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isBusy) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className="border-none bg-transparent p-0 shadow-none sm:max-w-[520px] data-[state=closed]:animate-none data-[state=open]:animate-none">
        <div className="popup-banner-card-enter grid max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto rounded-lg border bg-background p-6 shadow-lg">
          <SaveStockPromptIllustration
            sourceImageUrl={sourceImagePreviewUrl ?? undefined}
            sourceImageAlt={t("sourceImageAlt")}
          />
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {stockManagementError && (
            <Alert variant="destructive">
              <AlertDescription>{stockManagementError}</AlertDescription>
            </Alert>
          )}
          {isLimitReached && isManagingStocks ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("saveStockManageDescription")}
              </p>
              {isLoadingStocksForManagement ? (
                <div className="flex min-h-32 items-center justify-center gap-2 rounded-md border bg-muted/30 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("saveStockManageLoading")}
                </div>
              ) : stocksForManagement.length === 0 ? (
                <div className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                  {t("stockListEmptyTitle")}
                </div>
              ) : (
                <div className="max-h-[280px] overflow-y-auto rounded-md border bg-muted/20 p-2">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {stocksForManagement.map((stock) => {
                      const isDeleting = deletingStockId === stock.id;
                      return (
                        <div
                          key={stock.id}
                          className="overflow-hidden rounded-md border bg-background p-2"
                        >
                          <div className="relative aspect-square overflow-hidden rounded-md bg-gray-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={stock.image_url}
                              alt={stock.name || t("stockImageAlt")}
                              className="h-full w-full object-contain"
                              draggable={false}
                            />
                            {isDeleting ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                                <Loader2 className="h-5 w-5 animate-spin text-white" />
                              </div>
                            ) : null}
                          </div>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="mt-2 w-full gap-1 px-2"
                            onClick={() => handleDeleteAndSave(stock)}
                            disabled={isBusy}
                          >
                            {isDeleting ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {t("saveStockSaving")}
                              </>
                            ) : (
                              <>
                                <Trash2 className="h-4 w-4" />
                                {t("saveStockDeleteAndAddAction")}
                              </>
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}
          {!isLimitReached ? (
            <div className="grid gap-2">
              <Button type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("saveStockSaving")}
                  </>
                ) : (
                  t("saveStockAction")
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                {t("saveStockLater")}
              </Button>
            </div>
          ) : null}
          {!isManagingStocks && !isLimitReached ? (
            <div className="popup-banner-panel-enter pt-1">
              <label className="flex cursor-pointer items-center justify-center gap-3 text-sm text-muted-foreground">
                <span className="relative flex size-5 items-center justify-center">
                  <Checkbox
                    checked={dismissedPromptChecked}
                    onCheckedChange={handleDismissPromptChange}
                    className="size-5 data-[state=checked]:text-transparent"
                  />
                  <Check
                    className={`pointer-events-none absolute size-3.5 transition-opacity ${
                      dismissedPromptChecked
                        ? "opacity-100 text-primary-foreground"
                        : "opacity-0 text-transparent"
                    }`}
                    aria-hidden
                  />
                </span>
                <span>{t("saveStockDoNotShowAgain")}</span>
              </label>
            </div>
          ) : null}
          {isLimitReached ? (
            <div className="grid gap-2">
              {!isManagingStocks ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleRequestManageStocks}
                  disabled={isBusy}
                >
                  {t("manageStocksAction")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isBusy}
              >
                {t("saveStockDecline")}
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
