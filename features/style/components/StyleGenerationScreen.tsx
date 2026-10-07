"use client";

import { useTranslations } from "next-intl";
import { GenerationStateProvider } from "@/features/generation/context/GenerationStateContext";
import { GenerationScreenFrame } from "@/features/generation/components/GenerationScreenFrame";
import { PromptLockedGenerationHeader } from "@/features/generation/components/PromptLockedGenerationHeader";
import { PromptLockedGenerationResults } from "@/features/generation/components/PromptLockedGenerationResults";
import { OneTapStyleGenerationForm } from "@/features/style/components/OneTapStyleGenerationForm";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import type { SubscriptionPlan } from "@/features/subscription/subscription-config";

interface StyleGenerationScreenProps {
  preset: StylePresetPublicSummary;
  subscriptionPlan: SubscriptionPlan;
  canUseFreePose: boolean;
  /** 未ログインで開くか(ログインなしで生成できるカテゴリのときだけ。ページが判定する)。 */
  isGuest: boolean;
}

/**
 * One-Tap Style の、スマホの生成画面(/generate/style/[presetId])。
 * 中身はシート(StyleGenerationSheet)のスマホ版と同じ。外枠だけ全画面のページにした
 * (2026-10-07 ユーザー決定。神コレの名前の欄などでキーボードを出すと、シートが上下して欄が隠れるため)。
 */
export function StyleGenerationScreen({
  preset,
  subscriptionPlan,
  canUseFreePose,
  isGuest,
}: StyleGenerationScreenProps) {
  const t = useTranslations("style");
  return (
    <GenerationScreenFrame
      title={t("generationSheetTitle")}
      fallbackHref={`/styles/${encodeURIComponent(preset.slug)}`}
      handOffProgress={!isGuest}
    >
      <PromptLockedGenerationHeader mode="style" showBalancePlaceholder={!isGuest} />
      <GenerationStateProvider>
        <div className="space-y-8">
          <OneTapStyleGenerationForm
            variant="sheet"
            preset={preset}
            initialAuthState={isGuest ? "guest" : "authenticated"}
            showResultPanel={isGuest}
            subscriptionPlan={subscriptionPlan}
            canUseFreePose={canUseFreePose}
          />
        </div>
        {isGuest ? null : <PromptLockedGenerationResults generationType="one_tap_style" />}
      </GenerationStateProvider>
    </GenerationScreenFrame>
  );
}
