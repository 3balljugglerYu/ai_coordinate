"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { categoryNeedsUnlockContext } from "@/features/collections/lib/collection-unlock";
import type { PresetUnlockState } from "@/features/collections/lib/resolve-preset-unlock-state";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import type { SubscriptionPlan } from "@/features/subscription/subscription-config";

/**
 * 生成シートの部品。押した人だけが読み込む(フィード・詳細を開いた全員に重さを払わせない)。
 * ホームの棚のように押される見込みが高い面は `prefetch` で先に読んでおく。
 */
const loadStyleGenerationSheet = () =>
  import("@/features/style/components/StyleGenerationSheet").then(
    (mod) => mod.StyleGenerationSheet
  );
const StyleGenerationSheet = dynamic(loadStyleGenerationSheet, { ssr: false });

interface UseStylePresetGenerationSheetParams {
  /** 開くスタイル。棚のように押すまで決まらないときは省き、`open` に渡す。 */
  presetId?: string;
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
  /**
   * 押される前に、シートの部品と(ログイン中なら)料金プランを読んでおく。
   * 押してからシートが開くまでの待ちを減らすため、ホームの棚のように
   * 1つの面で1回だけ使う箇所に付ける(ボタンごとに付けると問い合わせが増える)。
   */
  prefetch?: boolean;
}

interface StylePresetTarget {
  presetId: string;
  slug?: string | null;
  /**
   * 呼び出し側がすでに持っているスタイル。渡すと問い合わせを省いてすぐ開ける
   * (ホームの棚・一覧は一覧の取得で持っている)。
   */
  preset?: StylePresetPublicSummary;
}

interface UseStylePresetGenerationSheetResult {
  /**
   * シートを開く(開けないときはログインの案内・スタイル紹介ページへ)。
   * `target` を渡すと、フックに渡したスタイルの代わりにそれを開く。
   */
  open: (target?: StylePresetTarget) => Promise<void>;
  /** シートかログインの案内が開いている間 true(自動で流れる棚を止めるのに使う)。 */
  isOpen: boolean;
  /** 開く準備をしているスタイル(押したカードに読み込み中を出すのに使う)。 */
  workingPresetId: string | null;
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

/** 購読プラン(モデル選択の南京錠に使う)。取れなければ投げる。 */
async function fetchSubscriptionPlan(): Promise<SubscriptionPlan> {
  const response = await fetch("/api/users/me/subscription-plan");
  if (!response.ok) {
    throw new Error(`subscription-plan failed: ${response.status}`);
  }
  const data = (await response.json()) as { plan?: SubscriptionPlan };
  return data.plan ?? "free";
}

function styleHrefFor(slug: string | null | undefined): string {
  return slug ? `/styles/${encodeURIComponent(slug)}` : "/styles";
}

/**
 * Persta ORIGINAL の「このカタログで生成する」で、その場で生成シートを開く。
 * ホームの引用元カード(UseStylePresetButton)と投稿詳細(OneTapStyleDetailCard)で共有する。
 * 中身は /styles(Perstaのカタログ)の生成シートと同じ。
 *
 * - 未ログイン → ログインなしで生成できるカテゴリ(コーディネート系)ならシートを開く。
 *   それ以外はログインの案内(2026-10-01 ユーザー決定。/style の未ログインと同じ範囲)
 * - 段階解放のカテゴリで、開放済みと確かめられないとき → スタイル紹介ページへ
 *   (未開放・会期終了の理由はそのページが伝える)
 * - それ以外 → シートを開く
 */
export function useStylePresetGenerationSheet({
  presetId: defaultPresetId,
  slug: defaultSlug,
  currentUserId,
  isViewerResolved,
  prefetch = false,
}: UseStylePresetGenerationSheetParams): UseStylePresetGenerationSheetResult {
  const pathname = usePathname();
  const router = useRouter();
  const [workingPresetId, setWorkingPresetId] = useState<string | null>(null);
  const isWorking = workingPresetId !== null;
  // 連打の止め。state は描画されるまで変わらないので、同じ描画内の2回目を止められない
  const isWorkingRef = useRef(false);
  // 先に取っておいた料金プラン(閲覧者が変わったら取り直す)
  const planRef = useRef<{ userId: string; plan: Promise<SubscriptionPlan> } | null>(
    null
  );
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [sheet, setSheet] = useState<{
    preset: StylePresetPublicSummary;
    plan: SubscriptionPlan;
    isGuest: boolean;
  } | null>(null);

  /*
    料金プラン。取れなければ無料プランへ倒す。
    取れなかった結果は覚えない(次に押したときに取り直す。無料のまま固定しない)。
  */
  const getSubscriptionPlan = (userId: string): Promise<SubscriptionPlan> => {
    if (planRef.current?.userId !== userId) {
      const entry = {
        userId,
        plan: fetchSubscriptionPlan().catch((error: unknown) => {
          console.error("Failed to resolve subscription plan:", error);
          if (planRef.current === entry) {
            planRef.current = null;
          }
          return "free" as SubscriptionPlan;
        }),
      };
      planRef.current = entry;
    }
    return planRef.current.plan;
  };

  useEffect(() => {
    if (!prefetch) {
      return;
    }
    void loadStyleGenerationSheet().catch(() => {
      // 先読みに失敗しても、押したときに読み直す
    });
  }, [prefetch]);

  useEffect(() => {
    if (!prefetch || !isViewerResolved || !currentUserId) {
      return;
    }
    void getSubscriptionPlan(currentUserId);
    // getSubscriptionPlan は ref だけを見るので依存に入れない
  }, [prefetch, isViewerResolved, currentUserId]);

  /*
    シートは部品が読み終わってから開く。読み終わる前に開くと、押したカードの
    読み込み中が消えたあと、しばらく何も出ない時間ができてしまう。
  */
  const showSheet = async (next: {
    preset: StylePresetPublicSummary;
    plan: SubscriptionPlan;
    isGuest: boolean;
  }) => {
    try {
      await loadStyleGenerationSheet();
    } catch (error) {
      console.error("Failed to load style generation sheet:", error);
    }
    setSheet(next);
  };

  /*
    未ログイン。ログインなしで生成できるカテゴリ(`allowGuestGeneration`)のときだけ
    シートを開く(/style の未ログインと同じ範囲。サーバーの生成 API も同じ判定で守る)。
    それ以外・取れなかったとき・段階解放のカテゴリ(未ログインは開放を確かめられない)は
    ログインの案内。
  */
  const openGuestSheetOrAskLogin = async (
    preset: StylePresetPublicSummary | null
  ) => {
    if (
      preset?.category.allowGuestGeneration &&
      !categoryNeedsUnlockContext(preset.category)
    ) {
      await showSheet({ preset, plan: "free", isGuest: true });
      return;
    }
    setShowAuthModal(true);
  };

  const open = async (target?: StylePresetTarget) => {
    const presetId = target?.presetId ?? defaultPresetId;
    const slug = target ? target.slug : defaultSlug;
    if (isWorkingRef.current || !isViewerResolved || !presetId) {
      return;
    }
    isWorkingRef.current = true;
    setWorkingPresetId(presetId);
    try {
      const preset = target?.preset ?? (await fetchPresetSummary(presetId));
      if (!currentUserId) {
        await openGuestSheetOrAskLogin(preset);
        return;
      }
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
      const plan = await getSubscriptionPlan(currentUserId);
      await showSheet({ preset, plan, isGuest: false });
    } finally {
      isWorkingRef.current = false;
      setWorkingPresetId(null);
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

  return {
    open,
    isOpen: sheet !== null || showAuthModal,
    isWorking,
    workingPresetId,
    overlays,
  };
}
