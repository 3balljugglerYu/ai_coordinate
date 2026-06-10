"use client";

import type { Ref } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";

const PRESET_NAME_MAX_CHARACTERS = 16;
const STYLE_PRESET_CARD_WIDTH_PX = 180;
const STYLE_PRESET_CARD_IMAGE_HEIGHT_PX = 240;
const STYLE_PRESET_CARD_TITLE_HEIGHT_PX = 44;
const STYLE_PRESET_CARD_HEIGHT_PX =
  STYLE_PRESET_CARD_IMAGE_HEIGHT_PX + STYLE_PRESET_CARD_TITLE_HEIGHT_PX;

interface StylePresetPreviewCardCategory {
  key: string;
  displayNameJa: string;
  displayNameEn: string;
  badgeColor: string;
  badgeTextColor: string;
}

interface StylePresetPreviewCardData {
  id: string;
  title: string;
  thumbnailImageUrl: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
  hasBackgroundPrompt: boolean;
  /**
   * 紐づく preset_categories のサマリ。`coordinate` (= default) はバッジ非表示で
   * 既存挙動と同じ見た目を保つ。それ以外のカテゴリのみバッジをサムネ画像の
   * 左下に表示する(キャラの顔まわりをバッジで覆わないための配置)。
   */
  category?: StylePresetPreviewCardCategory;
}

interface StylePresetPreviewCardProps {
  preset: StylePresetPreviewCardData;
  alt: string;
  disabled?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  /**
   * バッジ表示時の locale ('ja' / 'en')。display_name_{ja,en} を選ぶ。
   * 省略時は 'ja'。
   */
  locale?: "ja" | "en";
}

export function buildStylePresetImageSrc(
  preset: Pick<StylePresetPreviewCardData, "thumbnailImageUrl">
): string {
  return preset.thumbnailImageUrl;
}

export function truncateStylePresetName(name: string): string {
  const characters = Array.from(name);
  if (characters.length <= PRESET_NAME_MAX_CHARACTERS) {
    return name;
  }
  return `${characters.slice(0, PRESET_NAME_MAX_CHARACTERS).join("")}...`;
}

export function StylePresetPreviewCard({
  preset,
  alt,
  disabled = false,
  isSelected,
  onClick,
  buttonRef,
  locale = "ja",
}: StylePresetPreviewCardProps) {
  const selected = isSelected === true;
  // 'coordinate' は default カテゴリで既存挙動と同じ見た目を保つため、バッジを描画しない。
  const shouldShowBadge =
    preset.category != null && preset.category.key !== "coordinate";
  const badgeText =
    locale === "en"
      ? preset.category?.displayNameEn
      : preset.category?.displayNameJa;
  const card = (
    <Card
      className={`group overflow-hidden p-0 transition ${
        selected ? "border-2 border-primary" : "hover:ring-2 hover:ring-primary/50"
      }`}
      style={{
        width: STYLE_PRESET_CARD_WIDTH_PX,
        height: STYLE_PRESET_CARD_HEIGHT_PX,
      }}
    >
      <div className="flex h-full flex-col overflow-hidden bg-gray-100">
        <div
          className="relative w-full overflow-hidden bg-gray-100"
          style={{ height: STYLE_PRESET_CARD_IMAGE_HEIGHT_PX }}
        >
          <Image
            src={buildStylePresetImageSrc(preset)}
            alt={alt}
            fill
            sizes={`${STYLE_PRESET_CARD_WIDTH_PX}px`}
            className="object-cover object-top"
            priority={selected}
          />
          {shouldShowBadge && preset.category && (
            <span
              className="absolute bottom-1.5 left-1.5 inline-flex max-w-[80%] items-center truncate rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight shadow-sm"
              style={{
                backgroundColor: preset.category.badgeColor,
                color: preset.category.badgeTextColor,
              }}
              aria-label={badgeText}
            >
              {badgeText}
            </span>
          )}
        </div>
        <div
          className="flex items-center border-t bg-white px-3"
          style={{ height: STYLE_PRESET_CARD_TITLE_HEIGHT_PX }}
        >
          <p
            className="truncate text-sm font-medium text-slate-900"
            title={preset.title}
          >
            {truncateStylePresetName(preset.title)}
          </p>
        </div>
      </div>
    </Card>
  );

  if (!onClick) {
    return <div className="w-fit">{card}</div>;
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className="flex-shrink-0 text-left disabled:cursor-not-allowed disabled:opacity-60"
      aria-pressed={typeof isSelected === "boolean" ? selected : undefined}
      disabled={disabled}
    >
      {card}
    </button>
  );
}
