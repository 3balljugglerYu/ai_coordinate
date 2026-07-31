"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GenerationStateProvider } from "@/features/generation/context/GenerationStateContext";
import { GenerationFormContainer } from "@/features/generation/components/GenerationFormContainer";
import { fetchSourcePromptText } from "@/features/posts/lib/source-prompt-text-api";
import type { SubscriptionPlan } from "@/features/subscription/subscription-config";

interface PromptLockedGenerationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 派生生成の原作 root 投稿 ID。 */
  sourcePostId: string;
  subscriptionPlan: SubscriptionPlan;
  /**
   * 原作のプロンプト公開設定。
   *
   * `public` のときだけ入力欄へ本文を表示する（編集は不可）。公開なのに
   * コピーしないと読めない状態を避けるためで、生成に使う本文は表示値ではなく
   * サーバーが原作の author secret から解決する。
   */
  promptVisibility: "public" | "private";
}

/**
 * 非公開プロンプトの派生生成シート。
 *
 * じゆうモードの生成フォームをそのまま使い、プロンプト欄だけを施錠する。
 * 別フォームを作らないのは、比率・モデル・画像入力・ペルコイン残高確認・
 * ジョブのポーリング・進捗表示・結果表示までの一連の機構を二重に持つと
 * 片方だけ直す事故が起きるためである（過去に「片方だけ直して壊す」を
 * 繰り返している）。
 *
 * `GenerationStateProvider` をシート内に置く。プロバイダはページ側にも
 * あるが、投稿詳細ページには無い。ここで包むことで、生成中の進捗と
 * 完了後のプレビューがシート内で完結する。
 *
 * 本文はこのコンポーネントに一切入ってこない。渡すのは原作の投稿 ID だけで、
 * 本文はサーバーが provider 送信直前に author secret から解決する（REQ-005 /
 * REQ-007a）。
 */
export function PromptLockedGenerationSheet({
  open,
  onOpenChange,
  sourcePostId,
  subscriptionPlan,
  promptVisibility,
}: PromptLockedGenerationSheetProps) {
  const t = useTranslations("posts");
  const [lockedPromptText, setLockedPromptText] = useState<string | null>(null);

  /*
    公開プロンプトの本文は開いてから取りに行く。

    props へ載せると未フォロワーのブラウザにも届いてしまうため、
    サーバー側で認可する /api/posts/[id]/prompt-text 経由にする。
    取得に失敗しても生成自体は成立する（本文はサーバーが解決する）ので、
    表示だけ諦めてシートは開いたままにする。
  */
  useEffect(() => {
    if (!open || promptVisibility !== "public") {
      return;
    }
    let cancelled = false;
    fetchSourcePromptText(sourcePostId)
      .then((text) => {
        if (!cancelled) setLockedPromptText(text);
      })
      .catch(() => {
        if (!cancelled) setLockedPromptText(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, promptVisibility, sourcePostId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto rounded-t-2xl"
      >
        <SheetHeader>
          <SheetTitle>{t("lockedSheetTitle")}</SheetTitle>
          <SheetDescription>{t("lockedSheetDescription")}</SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-8">
          <GenerationStateProvider>
            <GenerationFormContainer
              subscriptionPlan={subscriptionPlan}
              authState="authenticated"
              mode="free"
              promptLocked
              lockedPromptText={lockedPromptText}
              sourcePostId={sourcePostId}
            />
          </GenerationStateProvider>
        </div>
      </SheetContent>
    </Sheet>
  );
}
