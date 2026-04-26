"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

export interface GuestResultPreviewImage {
  url: string;
  mimeType: string;
}

export interface GuestResultPreviewProps {
  /**
   * 表示する生成画像。null の間は何も表示しない。
   * `<GenerationFormContainer>` が in-memory で保持し、リロードで消える (UCL-017)。
   */
  result: GuestResultPreviewImage | null;
  /**
   * 「保存するにはログイン」CTA をクリックされたときの handler。
   * AuthModal を開く想定。
   */
  onLoginCtaClick: () => void;
}

/**
 * /coordinate ゲスト用の生成結果プレビュー。
 *
 * - DB 保存しない data URL を直接表示する
 * - リロードで消える（state が消えるため）
 * - 「保存するにはログイン」 CTA を結果カードの下に置く
 *
 * UCL-017 / 計画書 Phase 6
 */
export function GuestResultPreview({ result, onLoginCtaClick }: GuestResultPreviewProps) {
  const t = useTranslations("coordinate");

  if (!result) {
    return null;
  }

  return (
    <div className="space-y-3" data-testid="guest-result-preview">
      <Card className="overflow-hidden p-0">
        <Image
          src={result.url}
          alt={t("guestResultAlt")}
          width={1024}
          height={1024}
          className="h-auto w-full"
          unoptimized
        />
      </Card>
      <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-amber-900">{t("guestResultSaveHint")}</p>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onLoginCtaClick}
          className="self-end sm:self-auto"
        >
          <Lock className="mr-2 h-3.5 w-3.5" />
          {t("guestResultLoginCta")}
        </Button>
      </div>
    </div>
  );
}
