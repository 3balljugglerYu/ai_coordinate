"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { categoryNeedsUnlockContext } from "@/features/collections/lib/collection-unlock";
import type { PresetUnlockState } from "@/features/collections/lib/resolve-preset-unlock-state";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import type { SubscriptionPlan } from "@/features/subscription/subscription-config";

/** 生成シートは押した人だけが読み込む(フィード・詳細を開いた全員に重さを払わせない)。 */
const StyleGenerationSheet = dynamic(
  () =>
    import("@/features/style/components/StyleGenerationSheet").then(
      (mod) => mod.StyleGenerationSheet
    ),
  { ssr: false }
);

interface UseStylePresetGenerationSheetParams {
  presetId: string;
  /**
   * スタイル紹介ページ(/styles/[slug])。シートを開けないときの行き先。
   * 分からなければ、スタイルを取れたときはその slug、取れなければ /styles へ。
   */
  slug?: string | null;
  /** 閲覧者。null は未ログイン。 */
  currentUserId: string | null;
  /**
   * 閲覧者が確定したか。確定前は未ログインと区別できないので、押しても何もしない
   * (ログイン中の人にログインの案内を出さないため)。
   */
  isViewerResolved: boolean;
}

interface UseStylePresetGenerationSheetResult {
  /** シートを開く(開けないときはログインの案内・スタイル紹介ページへ)。 */
  open: () => Promise<void>;
  /** スタイル・開放状態・プランを取りに行っている間 true。 */
  isWorking: boolean;
  /** シートとログインの案内。呼び出し側の描画に含めること。 */
  overlays: ReactNode;
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

function styleHrefFor(slug: string | null | undefined): string {
  return slug ? `/styles/${encodeURIComponent(slug)}` : "/styles";
}

/**
 * Persta ORIGINAL の「このカタログで生成する」で、その場で生成シートを開く。
 * ホームの引用元カード(UseStylePresetButton)と投稿詳細(OneTapStyleDetailCard)で共有する。
 * 中身は /styles(ペルスタのカタログ)の生成シートと同じ。
 *
 * - 未ログイン → ログインなしで生成できるカテゴリ(コーディネート系)ならシートを開く。
 *   それ以外はログインの案内(2026-10-01 ユーザー決定。/style の未ログインと同じ範囲)
 * - 段階解放のカテゴリで、開放済みと確かめられないとき → スタイル紹介ページへ
 *   (未開放・会期終了の理由はそのページが伝える)
 * - それ以外 → シートを開く
 */
export function useStylePresetGenerationSheet({
  presetId,
  slug,
  currentUserId,
  isViewerResolved,
}: UseStylePresetGenerationSheetParams): UseStylePresetGenerationSheetResult {
  const pathname = usePathname();
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [sheet, setSheet] = useState<{
    preset: StylePresetPublicSummary;
    plan: SubscriptionPlan;
    isGuest: boolean;
  } | null>(null);

  /*
    未ログイン。ログインなしで生成できるカテゴリ(`allowGuestGeneration`)のときだけ
    シートを開く(/style の未ログインと同じ範囲。サーバーの生成 API も同じ判定で守る)。
    それ以外・取れなかったとき・段階解放のカテゴリ(未ログインは開放を確かめられない)は
    ログインの案内。
  */
  const openGuestSheetOrAskLogin = async () => {
    setIsWorking(true);
    try {
      const preset = await fetchPresetSummary(presetId);
      if (
        preset?.category.allowGuestGeneration &&
        !categoryNeedsUnlockContext(preset.category)
      ) {
        setSheet({ preset, plan: "free", isGuest: true });
        return;
      }
      setShowAuthModal(true);
    } finally {
      setIsWorking(false);
    }
  };

  const open = async () => {
    if (isWorking || !isViewerResolved) {
      return;
    }
    if (!currentUserId) {
      await openGuestSheetOrAskLogin();
      return;
    }
    setIsWorking(true);
    try {
      const preset = await fetchPresetSummary(presetId);
      if (!preset) {
        router.push(styleHrefFor(slug));
        return;
      }
      if (categoryNeedsUnlockContext(preset.category)) {
        const unlockState = await fetchUnlockState(presetId);
        if (unlockState?.status !== "unlocked") {
          router.push(styleHrefFor(slug ?? preset.slug));
          return;
        }
      }
      const plan = await fetchSubscriptionPlan();
      setSheet({ preset, plan, isGuest: false });
    } finally {
      setIsWorking(false);
    }
  };

  const overlays = (
    <>
      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        redirectTo={pathname}
      />

      {sheet ? (
        <StyleGenerationSheet
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) setSheet(null);
          }}
          preset={sheet.preset}
          subscriptionPlan={sheet.plan}
          isGuest={sheet.isGuest}
        />
      ) : null}
    </>
  );

  return { open, isWorking, overlays };
}
