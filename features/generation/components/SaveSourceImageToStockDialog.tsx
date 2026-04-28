"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import { SubscriptionUpsellDialog } from "@/features/subscription/components/SubscriptionUpsellDialog";
import { linkSourceImageStockToJobs } from "../lib/database";
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
}

interface SaveStockResponse {
  id?: string;
  error?: string;
}

function isLimitReachedMessage(message: string): boolean {
  // 既存 SOURCE_IMAGE_LIMIT_REACHED では copy.stockLimitReached を返すが、
  // ja: 「ストックの上限...」/ en: 「You have reached...」のような形になるため、
  // 既存 GenerationForm 側のキーワード「上限」「limit」で判定するのに合わせる。
  const lower = message.toLowerCase();
  return message.includes("上限") || lower.includes("limit");
}

export function SaveSourceImageToStockDialog({
  open,
  onOpenChange,
  originalFile,
  jobIds,
  onSaved,
}: SaveSourceImageToStockDialogProps) {
  const t = useTranslations("coordinate");
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpsell, setShowUpsell] = useState(false);

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("file", originalFile);

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
        if (isLimitReachedMessage(message)) {
          // 上限到達 -> サブスク誘導モーダルに切り替え
          setShowUpsell(true);
          onOpenChange(false);
          return;
        }
        throw new Error(message);
      }

      if (!data.id) {
        throw new Error(t("saveStockFailed"));
      }

      // 別タブ / 他コンポーネントへ「ストックが新規追加された」と通知
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(COORDINATE_STOCK_CREATED_EVENT));
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

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!isSaving) {
            onOpenChange(next);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("saveStockDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("saveStockDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              {t("saveStockLater")}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("saveStockSaving")}
                </>
              ) : (
                t("saveStockAction")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SubscriptionUpsellDialog
        open={showUpsell}
        onOpenChange={setShowUpsell}
      />
    </>
  );
}
