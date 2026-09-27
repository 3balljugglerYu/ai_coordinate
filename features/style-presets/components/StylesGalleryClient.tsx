"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bookmark } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { categoryNeedsUnlockContext } from "@/features/collections/lib/collection-unlock";
import type { PresetUnlockState } from "@/features/collections/lib/resolve-preset-unlock-state";
import { PresetUnlockNoticeDialog } from "@/features/style/components/PresetUnlockNoticeDialog";
import { preloadPercoinIcon } from "@/features/generation/components/PromptLockedGenerationHeader";
import type { SubscriptionPlan } from "@/features/subscription/subscription-config";
import { useStyleFavorites } from "@/features/style/hooks/useStyleFavorites";
import { useHorizontalScrollIndicator } from "@/features/style/hooks/useHorizontalScrollIndicator";
import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";
import { PublicStyleCard } from "@/features/style-presets/components/PublicStyleCard";
import { StyleTryOnConfirmDialog } from "@/features/style-presets/components/StyleTryOnConfirmDialog";
import { StylesCatalogChipBar } from "@/features/style-presets/components/StylesCatalogChipBar";
import {
  deriveStyleBrowseChips,
  filterStyleBrowsePresets,
  STYLE_NEW_WINDOW_DAYS,
  type StyleBrowseChipId,
} from "@/features/style/lib/style-browse-filter";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import { localizePublicPath, type Locale } from "@/i18n/config";

/**
 * その場で生成するシート。One-Tap Style の生成フォーム一式を抱えるので、
 * 押した人だけが読み込む(ページの静的シェルにも載せない)。
 */
const StyleGenerationSheet = dynamic(
  () =>
    import("@/features/style/components/StyleGenerationSheet").then(
      (mod) => mod.StyleGenerationSheet
    ),
  { ssr: false }
);

/**
 * スタイルの解放状態を問い合わせる(段階解放のカテゴリのときだけ呼ぶ)。
 * 取れなかったときは null。呼び出し側は今の「試着確認 → /style」に戻す。
 */
async function fetchPresetUnlockState(
  presetId: string
): Promise<PresetUnlockState | null> {
  try {
    const response = await fetch(
      `/api/style-presets/${encodeURIComponent(presetId)}/unlock-status`
    );
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as PresetUnlockState;
  } catch (error) {
    console.error("Failed to fetch preset unlock status:", error);
    return null;
  }
}

/**
 * 閲覧者の購読プラン(モデル選択の南京錠に使う)。取れなければ無料プランへ倒す。
 * FollowAndUsePromptButton(User ORIGINAL の生成シート)と同じ扱い。
 */
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

/** チップ先頭の絵文字(装飾)。探索シート(StyleBrowseSheet)と同じ見た目に揃える。 */
const CHIP_EMOJI: Partial<Record<string, string>> = {
  event: "🎉",
  favorites: "🔖",
  new: "✨",
  popular: "👑",
  creator: "🤝",
  collab: "🎪",
};

interface StylesGalleryClientProps {
  presets: StylePresetPublicSummary[];
  /** プリセットID -> 直近生成数(👑人気チップの表示判定と並び替え)。 */
  generateCounts: Record<string, number>;
  /** プリセットID -> 累計生成数(試着確認モーダルの「これまでに◯回」表示)。 */
  generateTotals: Record<string, number>;
  /**
   * 「✨新着」「🎉イベント」判定の基準時刻(ISO)。
   * サーバー("use cache" スコープ)で確定した値を受け取ることで、
   * SSR とハイドレーションでチップ構成が一致する。
   */
  nowIso: string;
  locale: Locale;
  /**
   * 生成シートでポーズ指定欄(運営のみの先行公開)を出すか。
   * ページが閲覧者を判定して渡す。サーバー(generate-async)でも検証される。
   */
  canUseFreePose?: boolean;
}

/**
 * /styles のチップフィルター付きギャラリー。
 * 絞り込みロジックは /style の探索シートと同じ純関数
 * (deriveStyleBrowseChips / filterStyleBrowsePresets)を再利用する。
 *
 * SEO 上の要点: 初期状態(すべて)では全カードが SSR で HTML に含まれる。
 * チップはクライアント側の絞り込み表示であり、クローラーは常に全件を見る。
 * お気に入り(🔖)などのユーザー状態は静的プリレンダを壊さないよう、
 * マウント後にブラウザ側で取得する。
 */
export function StylesGalleryClient({
  presets,
  generateCounts,
  generateTotals,
  nowIso,
  locale,
  canUseFreePose = false,
}: StylesGalleryClientProps) {
  const t = useTranslations("style");
  const router = useRouter();
  const pathname = usePathname();
  const [activeChip, setActiveChip] = useState<StyleBrowseChipId>("all");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // お気に入り(しおり)の集合と楽観更新トグル。/style・ホームと同じフックを共用する
  // (ゲストのタップはフック側がログイン誘導トーストを出す)。
  const { favoritePresetIds, toggleFavorite, hydrateFavorites } =
    useStyleFavorites({ isAuthenticated });
  // カードタップは即遷移せず、ホームのカルーセルと同じ「試着しますか？」確認を挟む。
  // 紹介ページ(/styles/[slug])へは href(修飾キー付きクリック/クローラー)で辿れる。
  const [confirmingPreset, setConfirmingPreset] =
    useState<StylePresetPublicSummary | null>(null);
  /*
    その場で生成するシート(刷新後・ログイン中だけ)。閉じたらアンマウントする。
    計画書: docs/planning/styles-generation-sheet-implementation-plan.md §10-5
  */
  const [sheetPreset, setSheetPreset] =
    useState<StylePresetPublicSummary | null>(null);
  // 一度取れたら使い回す(カードごとに先読みはしない)
  const [subscriptionPlan, setSubscriptionPlan] =
    useState<SubscriptionPlan | null>(null);
  // まだ使えないスタイルを押したときの案内
  const [unlockNotice, setUnlockNotice] = useState<PresetUnlockState | null>(
    null
  );
  // 解放状態・プランを確認している間の二度押しを止める
  const isOpeningSheetRef = useRef(false);

  const handleConfirm = () => {
    const preset = confirmingPreset;
    if (!preset) {
      return;
    }
    setConfirmingPreset(null);
    router.push(
      `${localizePublicPath("/style", locale)}?style=${encodeURIComponent(preset.id)}`
    );
  };

  // ログイン済みならお気に入り(しおり)を取得して 🔖 チップを有効化する。
  // 未ログイン・取得失敗時はチップが出ないだけで、一覧表示には影響しない。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled || !user) {
          return;
        }
        setIsAuthenticated(true);
        const { data } = await supabase
          .from("style_preset_favorites")
          .select("preset_id");
        if (cancelled) {
          return;
        }
        hydrateFavorites(
          (data ?? [])
            .map((row) => row.preset_id as string)
            .filter(Boolean)
        );
      } catch {
        // 認証状態の取得に失敗してもゲスト表示として成立する
      }
    })();
    return () => {
      cancelled = true;
    };
    // hydrateFavorites は useCallback で安定しているためマウント時のみ実行する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // カタログ刷新(段階公開中は運営のみ)では「すべて」が新着順を名乗り、✨新着チップは出さない。
  const isCatalogRevamp = useStylesCatalogRevamp();

  /*
    カードを押したとき。

    刷新後(公開前は運営のみ)かつログイン中は、その場で生成するシートを開く。
    それ以外は今までどおり「試着しますか？」を挟んで /style へ移動する。
    未ログインにシートを開かないのは、ゲストの「保存」がログイン後に元のページへ
    戻って処理される作りで、シートの上では完結しないため(計画書 §0-2)。

    段階解放のカテゴリだけ、開く前に解放状態を確かめる。/styles の一覧は
    解放ゲートを通していないので、未解放・会期終了のスタイルも並んでいる。
    確かめられなかったときは、今の「試着確認 → /style」に戻す(REQ-005)。
  */
  /*
    シートを開ける状態(刷新後・ログイン中)になったら、シートの見出しに出す
    コインのアイコンを先に読み込んでおく。開いた瞬間にアイコンまで出るようにする。
  */
  useEffect(() => {
    if (isCatalogRevamp && isAuthenticated) {
      preloadPercoinIcon();
    }
  }, [isCatalogRevamp, isAuthenticated]);

  const handleSelectPreset = async (preset: StylePresetPublicSummary) => {
    if (!isCatalogRevamp || !isAuthenticated) {
      setConfirmingPreset(preset);
      return;
    }
    if (isOpeningSheetRef.current) {
      return;
    }
    isOpeningSheetRef.current = true;
    try {
      if (categoryNeedsUnlockContext(preset.category)) {
        const unlockState = await fetchPresetUnlockState(preset.id);
        if (
          unlockState?.status === "locked" ||
          unlockState?.status === "ended" ||
          unlockState?.status === "login_required"
        ) {
          setUnlockNotice(unlockState);
          return;
        }
        if (unlockState?.status !== "unlocked") {
          setConfirmingPreset(preset);
          return;
        }
      }
      const plan = subscriptionPlan ?? (await fetchSubscriptionPlan());
      setSubscriptionPlan(plan);
      setSheetPreset(preset);
    } finally {
      isOpeningSheetRef.current = false;
    }
  };
  const context = useMemo(
    () => ({
      favoriteIds: favoritePresetIds,
      generateCounts,
      now: new Date(nowIso),
      isAuthenticated,
      hideNewChip: isCatalogRevamp,
    }),
    [favoritePresetIds, generateCounts, nowIso, isAuthenticated, isCatalogRevamp]
  );
  const chips = useMemo(
    () => deriveStyleBrowseChips(presets, context),
    [presets, context]
  );

  // チップ列の常時表示スクロールインジケーター(探索シートと共通のフック)。
  const {
    setScrollEl: setChipRowEl,
    trackRef: chipIndicatorTrackRef,
    thumbRef: chipIndicatorThumbRef,
  } = useHorizontalScrollIndicator({
    remeasureKey: chips,
    // 刷新後は、チップがはみ出さないときスクロールバーの空白を詰める
    collapseWhenFits: isCatalogRevamp,
  });
  const filtered = useMemo(
    () => filterStyleBrowsePresets(presets, activeChip, context),
    [presets, activeChip, context]
  );

  function chipLabel(chip: (typeof chips)[number]): string {
    if (chip.id.startsWith("category:")) {
      return (
        (locale === "ja" ? chip.categoryLabelJa : chip.categoryLabelEn) ??
        chip.id
      );
    }
    switch (chip.id) {
      case "all":
        return isCatalogRevamp ? t("styleChipAllNewest") : t("styleChipAll");
      case "event":
        return t("styleChipEvent");
      case "favorites":
        return t("styleChipFavorites");
      case "new":
        return t("styleChipNew");
      case "popular":
        return t("styleChipPopular");
      case "creator":
        return t("styleChipCreator");
      case "collab":
        return t("styleChipCollab");
      default:
        return chip.id;
    }
  }

  return (
    <div>
      {/* チップ列(横スクロール)。探索シートと同じ操作感。
          刷新後はスクロールで上端に固定する(StylesCatalogChipBar)。 */}
      <StylesCatalogChipBar>
        <div
          ref={setChipRowEl}
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label={t("styleBrowseSheetTitle")}
        >
          {chips.map((chip) => {
            const active = chip.id === activeChip;
            // 刷新後の「すべて」は旧「✨新着」の役割を引き継ぐので ✨ を付ける
            const emoji =
              chip.id === "all"
                ? isCatalogRevamp
                  ? "✨"
                  : undefined
                : CHIP_EMOJI[chip.id];
            return (
              <button
                key={chip.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveChip(chip.id)}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {emoji ? `${emoji} ` : ""}
                {chipLabel(chip)}
              </button>
            );
          })}
        </div>
        {/* チップ列の常時表示スクロールインジケーター。iOS はスクロール中しか
            ネイティブバーが出ず「横に続きがある」ことに気づきにくいため自前描画。
            位置・表示はフックが DOM を直接更新する(visibility 初期値 hidden、
            はみ出しがあるときだけ表示)。高さは常に確保しレイアウトシフトを防ぐ。 */}
        <div
          ref={chipIndicatorTrackRef}
          // 刷新後はバーが上下の余白と下の余白(mb-4)を持つので、ここはバー内の間隔だけにする
          className={`relative mx-1 mt-1 h-1 overflow-hidden rounded-full bg-slate-100 ${
            isCatalogRevamp ? "mb-1" : "mb-4"
          }`}
          style={{ visibility: "hidden" }}
          aria-hidden="true"
        >
          <div
            ref={chipIndicatorThumbRef}
            className="absolute top-0 h-full rounded-full bg-slate-300 [inset-inline-start:0]"
          />
        </div>
      </StylesCatalogChipBar>

      {/* 人気/新着の基準を明示する(探索シートと同じ注記)。 */}
      {activeChip === "popular" && filtered.length > 0 ? (
        <p className="mb-3 text-xs text-slate-500">
          {t("stylePopularSortNote")}
        </p>
      ) : null}
      {activeChip === "new" && filtered.length > 0 ? (
        <p className="mb-3 text-xs text-slate-500">
          {t("styleNewSortNote", { days: STYLE_NEW_WINDOW_DAYS })}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-500">
          {activeChip === "favorites"
            ? t("styleFavoritesEmpty")
            : t("styleBrowseEmpty")}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
          {filtered.map((preset) => {
            const isFavorite = favoritePresetIds.has(preset.id);
            return (
              <div key={preset.id} className="relative">
                <PublicStyleCard
                  preset={preset}
                  locale={locale}
                  onSelect={(selected) => void handleSelectPreset(selected)}
                />
                {/* お気に入り(しおり)はカード(リンク)の兄弟としてオーバーレイ配置
                    (a 要素への button ネスト回避)。探索シートと同じ意匠。
                    ゲストのタップはフック側がログイン誘導トーストを出す。 */}
                <button
                  type="button"
                  onClick={() => void toggleFavorite(preset.id, !isFavorite)}
                  aria-label={
                    isFavorite
                      ? t("styleFavoriteRemove")
                      : t("styleFavoriteAdd")
                  }
                  aria-pressed={isFavorite}
                  className="absolute left-1.5 top-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 sm:left-2 sm:top-2 sm:h-9 sm:w-9"
                >
                  <Bookmark
                    className={`h-4 w-4 sm:h-5 sm:w-5 ${
                      isFavorite
                        ? "fill-pink-500 text-pink-500"
                        : "text-slate-400"
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ホームのカルーセルと共通の試着確認モーダル。「試着する」で /style へ遷移する。 */}
      <StyleTryOnConfirmDialog
        preset={confirmingPreset}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmingPreset(null);
          }
        }}
        onConfirm={handleConfirm}
        locale={locale === "ja" ? "ja" : "en"}
        generateTotals={generateTotals}
      />

      {/* まだ使えないスタイル(未解放・会期終了・要ログイン)の案内。投稿詳細と同じ部品。 */}
      <PresetUnlockNoticeDialog
        open={unlockNotice !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUnlockNotice(null);
          }
        }}
        unlockState={unlockNotice}
        onLogin={() =>
          router.push(`/login?redirect=${encodeURIComponent(pathname ?? "/")}`)
        }
      />

      {/* その場で生成するシート(刷新後・ログイン中)。閉じたらアンマウントする。 */}
      {sheetPreset && subscriptionPlan ? (
        <StyleGenerationSheet
          open
          onOpenChange={(open) => {
            if (!open) {
              setSheetPreset(null);
            }
          }}
          preset={sheetPreset}
          subscriptionPlan={subscriptionPlan}
          canUseFreePose={canUseFreePose}
        />
      ) : null}
    </div>
  );
}
