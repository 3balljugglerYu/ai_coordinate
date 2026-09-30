"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles } from "lucide-react";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { categoryNeedsUnlockContext } from "@/features/collections/lib/collection-unlock";
import type { PresetUnlockState } from "@/features/collections/lib/resolve-preset-unlock-state";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import type { SubscriptionPlan } from "@/features/subscription/subscription-config";

/** 生成シートは押した人だけが読み込む(フィードを開いた全員に重さを払わせない)。 */
const StyleGenerationSheet = dynamic(
  () =>
    import("@/features/style/components/StyleGenerationSheet").then(
      (mod) => mod.StyleGenerationSheet
    ),
  { ssr: false }
);

interface UseStylePresetButtonProps {
  presetId: string;
  /** スタイル紹介ページ(/styles/[slug])。シートを開けないときの行き先。 */
  slug: string;
  /** 閲覧者。null は未ログイン。 */
  currentUserId: string | null;
  /**
   * 閲覧者が確定したか。確定前は未ログインと区別できないので、押しても何もしない
   * (ログイン中の人にログインの案内を出さないため)。
   */
  isViewerResolved: boolean;
}

async function fetchPresetSummary(presetId: string): Promise<StylePresetPublicSummary | null> {
  try {
    const response = await fetch(
      `/api/style-presets/${encodeURIComponent(presetId)}/summary`
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { preset?: StylePresetPublicSummary };
    return data.preset ?? null;
  } catch (error) {
    console.error("Failed to fetch style preset summary:", error);
    return null;
  }
}

async function fetchUnlockState(presetId: string): Promise<PresetUnlockState | null> {
  try {
    const response = await fetch(
      `/api/style-presets/${encodeURIComponent(presetId)}/unlock-status`
    );
    if (!response.ok) return null;
    return (await response.json()) as PresetUnlockState;
  } catch (error) {
    console.error("Failed to fetch preset unlock status:", error);
    return null;
  }
}

/** 購読プラン(モデル選択の南京錠に使う)。取れなければ無料プランへ倒す。 */
async function fetchSubscriptionPlan(): Promise<SubscriptionPlan> {
  try {
    const response = await fetch("/api/users/me/subscription-plan");
    if (!response.ok) {
      throw new Error(`subscription-plan failed: ${response.status}`);
    }
    const data = (await response.json()) as { plan?: SubscriptionPlan };
    return data.plan ?? "free";
  } catch (error) {
    console.error("Failed to resolve subscription plan:", error);
    return "free";
  }
}

/**
 * ホームの引用元カード(Persta ORIGINAL)の「このカタログで生成する」。
 * カタログ刷新後(公開前は運営だけ)に出す(2026-09-30 ユーザー決定)。
 *
 * User ORIGINAL の「このカタログで生成する」(FollowAndUsePromptButton)と同じく、
 * その場で生成シートを開く。中身は /styles(ペルスタのカタログ)の生成シートと同じ。
 *
 * - 未ログイン → ログインの案内(シートの上では保存まで完結しないため。/styles と同じ)
 * - 段階解放のカテゴリで、開放済みと確かめられないとき → スタイル紹介ページへ
 *   (未開放・会期終了の理由はそのページが伝える)
 * - それ以外 → シートを開く
 */
export function UseStylePresetButton({
  presetId,
  slug,
  currentUserId,
  isViewerResolved,
}: UseStylePresetButtonProps) {
  const t = useTranslations("posts");
  const pathname = usePathname();
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [sheet, setSheet] = useState<{
    preset: StylePresetPublicSummary;
    plan: SubscriptionPlan;
  } | null>(null);

  const styleHref = `/styles/${encodeURIComponent(slug)}`;

  const handleClick = async () => {
    if (isWorking || !isViewerResolved) {
      return;
    }
    if (!currentUserId) {
      setShowAuthModal(true);
      return;
    }
    setIsWorking(true);
    try {
      const preset = await fetchPresetSummary(presetId);
      if (!preset) {
        router.push(styleHref);
        return;
      }
      if (categoryNeedsUnlockContext(preset.category)) {
        const unlockState = await fetchUnlockState(presetId);
        if (unlockState?.status !== "unlocked") {
          router.push(styleHref);
          return;
        }
      }
      const plan = await fetchSubscriptionPlan();
      setSheet({ preset, plan });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleClick}
          disabled={isWorking}
          data-testid="feed-use-style-button"
          className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
        >
          {isWorking ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 text-left">{t("feedUseCatalog")}</span>
        </button>
      </div>

      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        redirectTo={pathname}
      />

      {sheet ? (
        <StyleGenerationSheet
          open
          onOpenChange={(open) => {
            if (!open) setSheet(null);
          }}
          preset={sheet.preset}
          subscriptionPlan={sheet.plan}
        />
      ) : null}
    </>
  );
}
