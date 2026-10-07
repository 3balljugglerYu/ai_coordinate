"use client";

import { useTranslations } from "next-intl";
import { GenerationStateProvider } from "@/features/generation/context/GenerationStateContext";
import { GenerationFormContainer } from "@/features/generation/components/GenerationFormContainer";
import { GenerationScreenFrame } from "@/features/generation/components/GenerationScreenFrame";
import { PromptLockedGenerationHeader } from "@/features/generation/components/PromptLockedGenerationHeader";
import { PromptLockedGenerationResults } from "@/features/generation/components/PromptLockedGenerationResults";
import { usePromptLockedGenerationInputs } from "@/features/generation/hooks/usePromptLockedGenerationInputs";
import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";
import type { SubscriptionPlan } from "@/features/subscription/subscription-config";

interface PromptLockedGenerationScreenProps {
  /** 派生生成の原作 root 投稿 ID。 */
  sourcePostId: string;
  subscriptionPlan: SubscriptionPlan;
  promptVisibility: "public" | "private";
}

/**
 * カタログから使う生成(派生生成)の、スマホの生成画面(/generate/post/[id])。
 * 中身はシート(PromptLockedGenerationSheet)のスマホ版と同じ。外枠だけ全画面のページにした
 * (2026-10-07 ユーザー決定。キーボードでシートが上下し、名前の欄が隠れたため)。
 */
export function PromptLockedGenerationScreen({
  sourcePostId,
  subscriptionPlan,
  promptVisibility,
}: PromptLockedGenerationScreenProps) {
  const t = useTranslations("posts");
  const isCatalogRevamp = useStylesCatalogRevamp();
  const { lockedPromptText, lockedNameInput, lockedNameInputLoading } =
    usePromptLockedGenerationInputs({ active: true, sourcePostId, promptVisibility });

  return (
    <GenerationScreenFrame
      title={t(isCatalogRevamp ? "feedUseCatalog" : "lockedSheetTitle")}
      fallbackHref={`/posts/${encodeURIComponent(sourcePostId)}`}
      handOffProgress
    >
      <PromptLockedGenerationHeader />
      <GenerationStateProvider>
        <GenerationFormContainer
          subscriptionPlan={subscriptionPlan}
          authState="authenticated"
          mode="free"
          promptLocked
          lockedPromptText={lockedPromptText}
          sourcePostId={sourcePostId}
          lockedNameInput={lockedNameInput}
          lockedNameInputLoading={lockedNameInputLoading}
        />
        <PromptLockedGenerationResults />
      </GenerationStateProvider>
    </GenerationScreenFrame>
  );
}
