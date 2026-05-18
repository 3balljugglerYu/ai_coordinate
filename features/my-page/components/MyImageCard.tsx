"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { getPostThumbUrl } from "@/features/posts/lib/utils";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";
import { getPromptSafeAltText } from "@/features/generation/lib/prompt-visibility";

interface MyImageCardProps {
  image: GeneratedImageRecord;
  currentUserId?: string | null;
  /**
   * 選択モード（カードをタップすると選択 toggle、リンク遷移なし）。
   * false の場合は従来通り詳細ページへのリンク。
   */
  selectionMode?: boolean;
  /** 選択モード中、このカードが選択されているか */
  selected?: boolean;
  /** 楽観的削除中（半透明 + 操作不可） */
  pendingDeletion?: boolean;
  /** 選択モード中にカードがタップされたときに呼ばれる */
  onToggleSelect?: () => void;
  /** 通常モードで長押しされたとき（選択モードに入る／対象を即選択する） */
  onLongPressEnterSelection?: () => void;
}

const LONG_PRESS_MS = 500;

export function MyImageCard({
  image,
  currentUserId,
  selectionMode = false,
  selected = false,
  pendingDeletion = false,
  onToggleSelect,
  onLongPressEnterSelection,
}: MyImageCardProps) {
  const t = useTranslations("myPage");

  const imageUrl = getPostThumbUrl({
    storage_path_thumb: image.storage_path_thumb,
    image_url: image.image_url,
    storage_path: image.storage_path,
  });

  const detailUrl = `/posts/${image.id}?from=my-page`;

  // 長押し検出。pointerdown でタイマー開始、move/up/cancel でクリア。
  // タイマーが満了したら onLongPressEnterSelection を発火し、続く click は抑止する。
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePointerDown = () => {
    if (selectionMode || !onLongPressEnterSelection || pendingDeletion) return;
    longPressFiredRef.current = false;
    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      onLongPressEnterSelection();
    }, LONG_PRESS_MS);
  };

  const handlePointerLeaveOrUp = () => {
    clearLongPress();
  };

  // ---- 表示用クラス ----
  const stateClasses = [
    "transition-transform duration-150",
    selected ? "scale-95 ring-2 ring-primary" : "",
    pendingDeletion ? "opacity-50 pointer-events-none" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const imageEl = imageUrl ? (
    <Image
      src={imageUrl}
      alt={getPromptSafeAltText(image, "画像")}
      width={800}
      height={800}
      className="w-full h-auto object-contain transition-transform hover:scale-105"
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px"
      unoptimized
    />
  ) : (
    <div className="flex aspect-square items-center justify-center text-gray-400">
      画像がありません
    </div>
  );

  // ---- 選択モード: button として描画してチェックボックスを重ねる ----
  if (selectionMode) {
    return (
      <Card className={`relative overflow-hidden p-0 ${stateClasses}`}>
        <button
          type="button"
          onClick={() => onToggleSelect?.()}
          aria-pressed={selected}
          aria-label={t("bulkDeleteSelectImageAria")}
          className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="relative w-full overflow-hidden bg-gray-100">
            {imageEl}
            <Checkbox
              checked={selected}
              aria-hidden="true"
              tabIndex={-1}
              className="pointer-events-none absolute left-2 top-2 data-[state=checked]:border-green-500 data-[state=checked]:bg-green-500 data-[state=checked]:text-white dark:data-[state=checked]:border-green-500 dark:data-[state=checked]:bg-green-500 dark:data-[state=checked]:text-white"
            />
          </div>
        </button>
      </Card>
    );
  }

  // ---- 通常モード: Link で詳細へ遷移。長押しで選択モードへ ----
  return (
    <Card className={`overflow-hidden p-0 ${stateClasses}`}>
      <Link
        href={detailUrl}
        prefetch={false}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerLeaveOrUp}
        onPointerUp={handlePointerLeaveOrUp}
        onPointerLeave={handlePointerLeaveOrUp}
        onPointerCancel={handlePointerLeaveOrUp}
        onContextMenu={(event) => {
          // モバイルの長押し時に出る OS のコンテキストメニュー（画像保存など）を抑止
          if (onLongPressEnterSelection) event.preventDefault();
        }}
        onClick={(event) => {
          // 長押しが発火した直後の click は遷移させない
          if (longPressFiredRef.current) {
            event.preventDefault();
            longPressFiredRef.current = false;
          }
        }}
      >
        <div className="relative w-full overflow-hidden bg-gray-100">
          {imageEl}
        </div>
      </Link>
    </Card>
  );
}
