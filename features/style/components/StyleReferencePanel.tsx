"use client";

import { useState } from "react";
import Image from "next/image";
import { ZoomIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * /style の「Style(参照スタイル)」プレビュー。画像タップで全画面ライトボックスを開く
 * (横長サンプルが2カラム半幅で小さくなる問題の対策)。
 */
export function StyleReferencePanel({
  label,
  imageSrc,
  imageAlt,
  className,
  collapsed = false,
  aspectRatio,
  tooltip,
  providerOverlay,
}: {
  label: string;
  imageSrc: string;
  imageAlt: string;
  className?: string;
  collapsed?: boolean;
  aspectRatio?: number;
  /**
   * 画像コンテナの右上に絶対配置で重ねる任意の要素 (主に LabelInfoTooltip の `?` を想定)。
   * preset カテゴリの user_guidance を画像内に表示するために使う。
   */
  tooltip?: React.ReactNode;
  /**
   * 画像コンテナの左下に絶対配置で重ねる任意の要素 (提供者クレジットを想定)。
   * タップで提供者プロフィールへ遷移できる。
   */
  providerOverlay?: React.ReactNode;
}) {
  const t = useTranslations("style");
  const [zoomed, setZoomed] = useState(false);
  const ar = aspectRatio ?? 1;

  return (
    <div className={className ?? "space-y-3"}>
      <Label
        className={
          collapsed
            ? "text-xs font-medium leading-none"
            : "text-base font-medium"
        }
      >
        {label}
      </Label>
      <Card className="overflow-hidden p-0">
        <div
          className="relative bg-slate-100"
          style={{ aspectRatio: String(ar) }}
        >
          {/* 画像タップで全画面表示(横長サンプルが小さくて見えない問題の対策)。
              ボタンの aria-label が名前を担うため、内側 Image は alt="" (装飾扱い)。
              ツールチップ/提供者クレジットは z-20 で上に載せ、各自のタップを維持する。 */}
          <button
            type="button"
            onClick={() => setZoomed(true)}
            className="absolute inset-0 z-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            aria-label={t("styleImageZoomAria")}
          >
            <Image
              src={imageSrc}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
              priority
            />
          </button>
          {/* タップで拡大できる合図。四隅で唯一どの要素とも競合しない左上に置く
              (右上=ツールチップ / 左下=提供者クレジットは長い名前で max-w-[180px] まで伸びる)。 */}
          <span
            className={`pointer-events-none absolute z-10 flex items-center justify-center rounded-full bg-black/45 text-white ${
              collapsed ? "left-1 top-1 h-5 w-5" : "left-2 top-2 h-7 w-7"
            }`}
            aria-hidden="true"
          >
            <ZoomIn className={collapsed ? "h-3 w-3" : "h-4 w-4"} />
          </span>
          {tooltip ? (
            <div
              className={`absolute z-20 ${collapsed ? "right-1 top-1" : "right-2 top-2"}`}
            >
              {tooltip}
            </div>
          ) : null}
          {providerOverlay ? (
            <div
              className={`absolute z-20 ${collapsed ? "bottom-1 left-1" : "bottom-2 left-2"}`}
            >
              {providerOverlay}
            </div>
          ) : null}
        </div>
      </Card>

      <Dialog open={zoomed} onOpenChange={setZoomed}>
        <DialogContent
          showCloseButton
          className="border-0 bg-transparent p-0 shadow-none sm:max-w-[95vw]"
          style={{ width: `min(95vw, calc(85vh * ${ar}))` }}
        >
          <DialogTitle className="sr-only">{label}</DialogTitle>
          <div
            className="relative w-full overflow-hidden rounded-lg bg-slate-900"
            style={{ aspectRatio: String(ar), maxHeight: "85vh" }}
          >
            <Image
              src={imageSrc}
              alt={imageAlt}
              fill
              sizes="95vw"
              className="object-contain"
            />
            {/* 拡大表示にもインラインと同じ位置(左下)で提供者クレジットを重ねる。 */}
            {providerOverlay ? (
              <div className="absolute bottom-2 left-2 z-10">
                {providerOverlay}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
