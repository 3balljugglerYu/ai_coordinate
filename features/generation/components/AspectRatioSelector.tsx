"use client";

import { useTranslations } from "next-intl";
import { AspectRatioCardSelector } from "@/components/AspectRatioCardSelector";
import {
  FREE_OUTPUT_ASPECT_RATIO_MODES,
  type FreeOutputAspectRatioMode,
} from "@/shared/generation/style-output-aspect-ratio";

interface AspectRatioSelectorProps {
  value: FreeOutputAspectRatioMode;
  onChange: (value: FreeOutputAspectRatioMode) => void;
  disabled?: boolean;
}

/**
 * じゆうモード(Free Style)の出力比率セレクタ。
 *
 * 表示は共通の `AspectRatioCardSelector`(横スクロールのカード UI・a11y・スクロール復元)に
 * 委ね、ここでは Free 固有の選択肢(source + 明示9比率。preset_image は持たない)と
 * next-intl の文言解決だけを担う。
 */
export function AspectRatioSelector({
  value,
  onChange,
  disabled,
}: AspectRatioSelectorProps) {
  const t = useTranslations("free");

  return (
    <AspectRatioCardSelector
      modes={FREE_OUTPUT_ASPECT_RATIO_MODES}
      value={value}
      onChange={(next) => onChange(next as FreeOutputAspectRatioMode)}
      disabled={disabled}
      labels={{
        sectionTitle: t("aspectSectionTitle"),
        auto: t("aspectAuto"),
        autoDescription: t("aspectAutoDescription"),
        square: t("aspectSquare"),
        portrait: t("aspectPortrait"),
        landscape: t("aspectLandscape"),
      }}
    />
  );
}
