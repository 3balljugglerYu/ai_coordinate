"use client";

import Image from "next/image";
import { Check, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface PickerImageTileProps {
  imageUrl: string;
  alt: string;
  /** クリック時のアクション。 */
  onSelect: () => void;
  /** 削除可能なら指定。 */
  onDelete?: () => void;
  /** 選択中なら 2px リング表示。 */
  selected?: boolean;
  /** クリック直後の fetch 待ちなどでスピナーを出す。 */
  loading?: boolean;
  /** disabled 状態 (生成中など)。 */
  disabled?: boolean;
}

export function PickerImageTile({
  imageUrl,
  alt,
  onSelect,
  onDelete,
  selected = false,
  loading = false,
  disabled = false,
}: PickerImageTileProps) {
  const t = useTranslations("imageSourcePicker");

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled || loading}
        aria-label={t("selectImageAria")}
        aria-pressed={selected}
        className={cn(
          "relative block w-full overflow-hidden rounded-md bg-gray-100",
          "aspect-square",
          "ring-offset-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <Image
          src={imageUrl}
          alt={alt}
          fill
          sizes="(max-width: 768px) 33vw, 160px"
          className="object-cover"
          unoptimized
        />
        {loading ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </span>
        ) : null}
        {selected && !loading ? (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.5)" }}
            />
            <span
              aria-hidden="true"
              className="absolute z-20 inline-flex h-6 w-6 items-center justify-center rounded-full text-white shadow"
              style={{ backgroundColor: "#22c55e", top: "6px", right: "6px" }}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
          </>
        ) : null}
      </button>

      {onDelete ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          aria-label={t("stockDeleteAria")}
          disabled={disabled || loading}
          className={cn(
            "absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full",
            "bg-black/70 text-white shadow",
            "transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
            (disabled || loading) && "cursor-not-allowed opacity-60",
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
