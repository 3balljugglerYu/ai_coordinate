"use client";

import Link from "next/link";
import { Heart, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useWardrobeSaveTrigger } from "@/features/wardrobe/hooks/use-wardrobe-save";

interface GuestGenerationTrialCtaProps {
  title: string;
  description: string;
  actionLabel: string;
  testId: string;
}

/**
 * ゲスト試用バナー。
 *
 * - 生成前: 現状どおり `/login` へのフルページ遷移。
 * - 生成後（共有ストアにゲスト生成画像がある）: 「保存する」ボタンに切り替わり、
 *   押下で signup 固定モーダル + 画像引き継ぎ（= 結果パネルの「保存する」と同一挙動）。
 *   claim は遷移先ページの `useWardrobeSave` が処理する。
 */
export function GuestGenerationTrialCta({
  title,
  description,
  actionLabel,
  testId,
}: GuestGenerationTrialCtaProps) {
  const tStyle = useTranslations("style");
  const saveTrigger = useWardrobeSaveTrigger();

  return (
    <div
      data-testid={testId}
      className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3 sm:items-center">
        <Sparkles
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 sm:mt-0"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-semibold text-amber-900">{title}</p>
          <p className="mt-1 text-xs text-amber-800">{description}</p>
        </div>
      </div>
      {saveTrigger.hasGuestImage ? (
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={saveTrigger.trigger}
          className="self-end sm:self-auto"
        >
          <Heart className="mr-2 h-4 w-4" />
          {tStyle("wardrobeSaveButton")}
        </Button>
      ) : (
        <Button
          asChild
          variant="default"
          size="sm"
          className="self-end sm:self-auto"
        >
          <Link href="/login">{actionLabel}</Link>
        </Button>
      )}
      <AuthModal {...saveTrigger.authModalProps} />
    </div>
  );
}
