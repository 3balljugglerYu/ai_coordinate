"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles, UserPlus } from "lucide-react";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useToast } from "@/components/ui/use-toast";
import type { SubscriptionPlan } from "@/features/subscription/subscription-config";
import { trackFollowFromCard, trackPromptUseTapped } from "../lib/home-view-events";
import type { PromptActionSummary } from "../types";

/**
 * 生成シートは遅延読み込みにする。じゆうモードの生成フォーム一式を抱えており、
 * フィードを開いた全員にその重さを払わせる理由がない。押した人だけが読み込む。
 */
const PromptLockedGenerationSheet = dynamic(
  () =>
    import("@/features/generation/components/PromptLockedGenerationSheet").then(
      (mod) => mod.PromptLockedGenerationSheet
    ),
  { ssr: false }
);

interface FollowAndUsePromptButtonProps {
  summary: PromptActionSummary;
  /** 閲覧者。null は未ログイン。 */
  currentUserId: string | null;
  /** 閲覧者が原作者をフォローしているか。未取得は undefined。 */
  isFollowingAuthor: boolean | undefined;
  /** フォローが成立したとき、親のフォロー状態も合わせる。 */
  onFollowChange?: (userId: string, isFollowing: boolean) => void;
}

/**
 * フィードのカード上に置く「このプロンプトで作る」/「フォローして使う」（ADR-007）。
 *
 * 既存の `FollowButton` は follow / unfollow のトグルで、押下後に生成シートを
 * 開く責務を持たない。ここでは「使いたい」がそのままフォロー動機に変換される
 * 一本道を作るため、状態遷移をこのコンポーネントに閉じ込める。
 *
 * - 未ログイン → AuthModal（フォローも生成もできないため）
 * - 未フォロー → フォローを実行し、**成功したときだけ**シートを開く
 * - フォロー済み・本人 → そのままシートを開く
 *
 * フォローに失敗したらシートは開かない。開いてしまうと、生成 API 側で弾かれて
 * 「押せたのに作れない」体験になる。
 */
export function FollowAndUsePromptButton({
  summary,
  currentUserId,
  isFollowingAuthor,
  onFollowChange,
}: FollowAndUsePromptButtonProps) {
  const t = useTranslations("posts");
  const followT = useTranslations("follow");
  const { toast } = useToast();
  const pathname = usePathname();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan | null>(
    null
  );

  const authorId = summary.originAuthorId;
  const isOwnPrompt = !!currentUserId && !!authorId && currentUserId === authorId;
  // フォロー判定の対象は原作者。派生投稿が並んでいても原作者を見る。
  const hasAccess = isOwnPrompt || isFollowingAuthor === true;

  // 原作が使えないときは導線ごと出さない。押しても解決しようがない。
  if (!summary.isAvailable || !authorId) {
    return null;
  }

  /**
   * 購読プランはシートを開く直前に取る。カードごとに先読みすると、フィードを
   * 開いただけで人数ぶんのリクエストが飛ぶ。1度取れたら使い回す。
   */
  const resolveSubscriptionPlan = async (): Promise<SubscriptionPlan> => {
    if (subscriptionPlan) {
      return subscriptionPlan;
    }
    try {
      const response = await fetch("/api/users/me/subscription-plan");
      if (!response.ok) {
        throw new Error(`subscription-plan failed: ${response.status}`);
      }
      const data = (await response.json()) as { plan?: SubscriptionPlan };
      const plan = data.plan ?? "free";
      setSubscriptionPlan(plan);
      return plan;
    } catch (error) {
      console.error("Failed to resolve subscription plan:", error);
      // 取得できなくても生成そのものは止めない。無料プランへ倒す。
      setSubscriptionPlan("free");
      return "free";
    }
  };

  const openSheet = async () => {
    await resolveSubscriptionPlan();
    // 分子(ADR-006)。表示形式は home-view-events 側が直前のホームから解決する。
    trackPromptUseTapped(summary.originPostId);
    setIsSheetOpen(true);
  };

  const handleClick = async () => {
    if (isWorking) {
      return;
    }
    if (!currentUserId) {
      setShowAuthModal(true);
      return;
    }

    setIsWorking(true);
    try {
      if (hasAccess) {
        await openSheet();
        return;
      }

      const response = await fetch(`/api/users/${authorId}/follow`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(error?.error || followT("followFailed"));
      }

      onFollowChange?.(authorId, true);
      trackFollowFromCard(summary.originPostId);
      await openSheet();
    } catch (error) {
      // 失敗したらシートは開かない。開くと生成APIで弾かれて二度手間になる。
      toast({
        title: followT("errorTitle"),
        description:
          error instanceof Error ? error.message : followT("genericFailed"),
        variant: "destructive",
      });
    } finally {
      setIsWorking(false);
    }
  };

  const label = hasAccess ? t("feedUsePrompt") : t("feedFollowAndUsePrompt");

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleClick}
          disabled={isWorking}
          data-testid="feed-use-prompt-button"
          className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
        >
          {isWorking ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : hasAccess ? (
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          {/* 15言語で文言の長さが揃わないため、折り返しを許して切らない */}
          <span className="min-w-0 text-left">{label}</span>
        </button>

        {summary.usageCount > 0 ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("sourcePromptUsageCount", { count: summary.usageCount })}
          </span>
        ) : null}
      </div>

      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        redirectTo={pathname}
      />

      {isSheetOpen && subscriptionPlan ? (
        <PromptLockedGenerationSheet
          open={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          sourcePostId={summary.originPostId}
          subscriptionPlan={subscriptionPlan}
          promptVisibility={summary.promptVisibility}
        />
      ) : null}
    </>
  );
}
