"use client";

import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export interface WardrobeSaveButtonProps {
  /** クリック時に呼ぶ。`useWardrobeSave().requestSave` をラップして渡す想定。 */
  onClick: () => void;
  /** 任意の追加クラス。 */
  className?: string;
}

/**
 * ゲスト向け「保存する（＝アカウントへ保存してログイン転換）」ボタン。
 *
 * 文言は "style" 名前空間の wardrobeSaveButton を共通で使う。
 * 表示制御（ゲストのみ表示）は呼び出し側が `useWardrobeSave().isGuest` で行う。
 */
export function WardrobeSaveButton({
  onClick,
  className,
}: WardrobeSaveButtonProps) {
  const t = useTranslations("style");

  return (
    <Button
      type="button"
      size="sm"
      onClick={onClick}
      className={
        className ??
        "flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium shadow-sm"
      }
    >
      <Heart className="h-4 w-4" />
      <span>{t("wardrobeSaveButton")}</span>
    </Button>
  );
}
