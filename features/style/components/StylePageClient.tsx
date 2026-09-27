"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { LayoutGrid } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StyleBrowseSheet } from "@/features/style/components/StyleBrowseSheet";
import { StylePresetPreviewCard } from "@/features/style/components/StylePresetPreviewCard";
import {
  OneTapStyleGenerationForm,
  type OneTapStyleGenerationFormHandle,
  type OneTapStyleGenerationFormStatus,
} from "@/features/style/components/OneTapStyleGenerationForm";
import { useStyleFavorites } from "@/features/style/hooks/useStyleFavorites";
import { recordStyleUsageClientEvent } from "@/features/style/lib/style-usage-client";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import type { SubscriptionPlan } from "@/features/subscription/subscription-config";

interface StylePageClientProps {
  presets: readonly StylePresetPublicSummary[];
  initialAuthState?: "authenticated" | "guest";
  initialSelectedPresetId?: string | null;
  /**
   * 告知バナーからの着地(`/style?model=...`)で先に選んでおくモデル。
   * ⚠️ URL 由来の外部入力。`isKnownModelInput` → `normalizeModelName` →
   * `resolveEffectiveModelForAuthState` を通してから state に入れること。
   * 生の値を使うと、無料プラン・未ログインの制限を URL で迂回されうる。
   */
  requestedModel?: string | null;
  /**
   * `?style=` で要求されたスタイルが未開放だったときの理由。
   * 通常の導線では押す前に伝えるが、共有リンク等でここへ直接来たときの保険。
   */
  lockedRequestedReason?:
    | "sequential"
    | "prerequisite"
    | "login_required"
    | null;
  /**
   * 生成直後の結果プレビュー（StyleResultPanel）を表示するかどうか。
   * 未指定 (true) のときは表示。ログインユーザー向けには
   * 生成結果一覧が同じ役割を担うため、ページ側から false を渡して
   * 非表示にする。
   */
  showResultPanel?: boolean;
  /**
   * 認証ユーザーのサブスクリプションプラン。未ログイン時は "free" を渡しても良いが
   * モデル選択ロックには影響しない（ゲストロジック側で処理される）。
   */
  subscriptionPlan?: SubscriptionPlan;
  /**
   * framing_mode (free_pose) のチェックボックスを表示するか。
   * admin viewer 限定の先行公開のため、page 側で isAdminViewer を判定して渡す。
   * UI 非表示はセキュリティではなく、サーバ側 (generate-async) でも検証される。
   */
  canUseFreePose?: boolean;
  /**
   * このユーザーが既に生成済みの企画(コレクション)プリセットIDの一覧。
   * 該当カードに「生成済み」の ✓ バッジを出して、生成した/まだを見分けやすくする。
   * サーバ側(StylePageBody)で collection-series カテゴリ分のみ集計して渡す。
   */
  generatedPresetIds?: readonly string[];
  /**
   * 探索シート用: プリセットID -> 直近生成数(👑人気チップの判定・並び替え)。
   * サーバ側でキャッシュ済み(style-popularity)。
   */
  generateCounts?: Readonly<Record<string, number>>;
  /** 探索シート用: プリセットID -> 累計生成数(拡大プレビューの利用回数表示)。 */
  generateTotals?: Readonly<Record<string, number>>;
  /** 探索シート用: 本人のお気に入りプリセットIDの初期集合(以後は楽観更新)。 */
  initialFavoritePresetIds?: readonly string[];
}

function resolveInitialSelectedPresetId(
  presets: readonly StylePresetPublicSummary[],
  initialSelectedPresetId?: string | null
): StylePresetPublicSummary["id"] {
  /*
    未開放(locked)のプリセットは選ばない。

    sequential の段階解放では「次の1件」がシルエットとして一覧に残るため、
    ID の存在だけで判定すると locked のまま選択され、フォームがそれを選んだ状態に
    なってしまう。「まだ開放されていません」と伝えた直後に、その未開放スタイルで
    生成できる状態が残るのは筋が通らない。
  */
  if (
    initialSelectedPresetId &&
    presets.some(
      (preset) => preset.id === initialSelectedPresetId && preset.locked !== true
    )
  ) {
    return initialSelectedPresetId;
  }

  // フォールバックも開放済みの先頭にする(先頭がシルエットのこともあるため)
  return presets.find((preset) => preset.locked !== true)?.id ?? presets[0]?.id ?? "";
}

/**
 * `/style`(One-Tap Style)ページ本体。
 *
 * ここが持つのは**スタイルの選択**(ストリップ・探索シート・お気に入り・URL との同期)と、
 * 未開放の `?style=` への案内、訪問の記録だけ。選んだスタイルでの入力・生成・結果は
 * `OneTapStyleGenerationForm` が担う(`/styles` の生成シートと同じ部品)。
 *
 * スタイルを切り替えるときの「結果を消してよいか」の確認はフォームの状態で決まるので、
 * フォームの `requestChange` を通して切り替える。
 */
export function StylePageClient({
  presets,
  initialAuthState,
  initialSelectedPresetId,
  requestedModel = null,
  lockedRequestedReason = null,
  showResultPanel = true,
  subscriptionPlan = "free",
  canUseFreePose = false,
  generatedPresetIds,
  generateCounts,
  generateTotals,
  initialFavoritePresetIds,
}: StylePageClientProps) {
  const t = useTranslations("style");
  /*
    共有リンク等で未開放の `?style=` に来たときの保険。通常の導線
    (スタイル紹介ページ・投稿詳細)では押す前にロック表示になるため、ここは出ない。
  */
  const [isLockedRequestOpen, setIsLockedRequestOpen] = useState(
    lockedRequestedReason !== null
  );
  const locale = useLocale();
  const styleCardLocale = locale === "en" ? "en" : "ja";
  // 生成済みの企画プリセットID集合(✓バッジ判定用。O(1)参照のため Set 化)。
  const generatedPresetIdSet = useMemo(
    () => new Set(generatedPresetIds ?? []),
    [generatedPresetIds],
  );
  // 探索シート(チップ+グリッド)の開閉。
  const [isBrowseSheetOpen, setIsBrowseSheetOpen] = useState(false);
  const presetStripRef = useRef<HTMLDivElement | null>(null);
  const presetButtonRefs = useRef(
    new Map<StylePresetPublicSummary["id"], HTMLButtonElement>()
  );
  const formRef = useRef<OneTapStyleGenerationFormHandle | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<
    StylePresetPublicSummary["id"]
  >(() => resolveInitialSelectedPresetId(presets, initialSelectedPresetId));
  const [isPresetStripDragging, setIsPresetStripDragging] = useState(false);
  const hasTrackedVisitRef = useRef(false);
  const syncedSelectedPresetParamRef = useRef<string | null>(
    initialSelectedPresetId ?? null
  );
  const presetDragStartXRef = useRef(0);
  const presetDragStartScrollLeftRef = useRef(0);
  const suppressPresetClickRef = useRef(false);
  /*
    フォームの状態のうち、スタイル一覧が使うもの。フォームがマウント後に知らせる。
    ログイン状態はフォームが回数制限の取得で確定させるので、それまでは初期値を使う。
  */
  const [formStatus, setFormStatus] = useState<OneTapStyleGenerationFormStatus>(
    () => ({
      isGenerating: false,
      isGuestResultLocked: false,
      effectiveAuthState: initialAuthState ?? null,
    })
  );
  const { isGenerating, isGuestResultLocked, effectiveAuthState } = formStatus;

  const selectedPreset =
    presets.find((preset) => preset.id === selectedPresetId) ?? presets[0] ?? null;

  // 探索シートのお気に入り(しおり)。楽観更新+失敗時ロールバックはフック側が担う。
  const { favoritePresetIds, toggleFavorite } = useStyleFavorites({
    initialFavoritePresetIds,
    isAuthenticated: effectiveAuthState === "authenticated",
  });

  /*
    利用イベントの categoryKey は、確定したスタイルの ID から一覧で引く。
    ジョブの再開では選択中とは別のスタイルの結果を確定しうるため。
  */
  const resolveCategoryKey = useCallback(
    (styleId: string) =>
      presets.find((preset) => preset.id === styleId)?.category.key ?? null,
    [presets]
  );

  useEffect(() => {
    if (!selectedPresetId) return;

    const strip = presetStripRef.current;
    const selectedButton = presetButtonRefs.current.get(selectedPresetId);
    if (!strip || !selectedButton) return;

    // 横スクロールのストリップ内でのみ選択プリセットを中央寄せする。
    // scrollIntoView は縦方向のページスクロールも巻き込み、読み込み直後に
    // ページが少し下がって見える原因になるため、strip.scrollLeft を直接
    // 操作して横スクロールに限定する。初期表示の presets[0] は左端のため
    // targetLeft が負になり Math.max(0, ...) で 0 にクランプされ、スクロール
    // は発生しない。
    const stripRect = strip.getBoundingClientRect();
    const buttonRect = selectedButton.getBoundingClientRect();
    const targetLeft = Math.max(
      0,
      strip.scrollLeft +
        (buttonRect.left - stripRect.left) -
        (strip.clientWidth - selectedButton.clientWidth) / 2
    );

    // scrollTo 未実装の環境(SSR/古い jsdom 等)では何もしない。
    strip.scrollTo?.({ left: targetLeft, behavior: "smooth" });
  }, [selectedPresetId]);

  /*
    URL(`?style=`)の変化を選択へ反映する。

    フォームを切り出す前(2,744 行の一体の部品)から同じ書き方で、React Compiler が
    部品全体を解析していなかったため指摘されていなかった。切り出しでは動きを変えない
    方針(計画書 ADR-009)なので、書き換えずに抑止する。
  */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const hasValidPresetParam =
      typeof initialSelectedPresetId === "string" &&
      presets.some((preset) => preset.id === initialSelectedPresetId);

    if (
      hasValidPresetParam &&
      syncedSelectedPresetParamRef.current !== initialSelectedPresetId
    ) {
      syncedSelectedPresetParamRef.current = initialSelectedPresetId;
      setSelectedPresetId(initialSelectedPresetId);
      return;
    }

    if (presets.some((preset) => preset.id === selectedPresetId)) {
      return;
    }

    syncedSelectedPresetParamRef.current = initialSelectedPresetId ?? null;
    setSelectedPresetId(
      resolveInitialSelectedPresetId(presets, initialSelectedPresetId)
    );
  }, [initialSelectedPresetId, presets, selectedPresetId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handlePresetSelect = (presetId: StylePresetPublicSummary["id"]) => {
    if (presetId === selectedPresetId) {
      return;
    }

    // 結果があるときの確認と、エラー・結果のリセットはフォームが担う
    formRef.current?.requestChange(() => {
      setSelectedPresetId(presetId);
    });
  };

  /** 探索シートからの選択: シートを閉じて通常の選択フローへ。 */
  const handleSelectFromBrowseSheet = (
    presetId: StylePresetPublicSummary["id"],
  ) => {
    setIsBrowseSheetOpen(false);
    handlePresetSelect(presetId);
  };

  const endPresetStripDrag = () => {
    presetDragStartXRef.current = 0;
    presetDragStartScrollLeftRef.current = 0;
    setIsPresetStripDragging(false);
  };

  useEffect(() => {
    if (!isPresetStripDragging) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const strip = presetStripRef.current;
      if (!strip) {
        return;
      }

      const deltaX = event.clientX - presetDragStartXRef.current;
      if (Math.abs(deltaX) > 6) {
        suppressPresetClickRef.current = true;
      }

      strip.scrollLeft = presetDragStartScrollLeftRef.current - deltaX;
    };

    const handleMouseUp = () => {
      endPresetStripDrag();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isPresetStripDragging]);

  const handlePresetStripMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    presetDragStartXRef.current = event.clientX;
    presetDragStartScrollLeftRef.current =
      presetStripRef.current?.scrollLeft ?? 0;
    suppressPresetClickRef.current = false;
    setIsPresetStripDragging(true);
    event.preventDefault();
  };

  const handlePresetStripClickCapture = (
    event: ReactMouseEvent<HTMLDivElement>
  ) => {
    if (!suppressPresetClickRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    suppressPresetClickRef.current = false;
  };

  const buildPresetButtonRef =
    (presetId: StylePresetPublicSummary["id"]) =>
    (node: HTMLButtonElement | null) => {
      if (node) {
        presetButtonRefs.current.set(presetId, node);
        return;
      }

      presetButtonRefs.current.delete(presetId);
    };

  useEffect(() => {
    if (!selectedPreset || hasTrackedVisitRef.current) {
      return;
    }

    hasTrackedVisitRef.current = true;
    void recordStyleUsageClientEvent({
      eventType: "visit",
      // styleId は null のまま(1訪問=1プリセットではなく、シート内で選び替えられる)。
      // 企画別の訪問数は categoryKey で数える。styleId で絞る集計では
      // visit 行が1件もヒットしないため、admin の訪問カードは常に 0 だった。
      styleId: null,
      categoryKey: selectedPreset.category.key,
    }).catch(() => {
      // Tracking failures should not affect the page UX.
    });
  }, [selectedPreset]);

  return (
    <div className="space-y-8">
      <section className="space-y-3" data-tour="style-tour-preset">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-900">
              {t("sectionTitle")}
            </h2>
            <p className="text-sm leading-6 text-slate-500">
              {t("sectionDescription")}
            </p>
          </div>
          {/* 探索シート(チップ+グリッド)を開く。ストリップは従来どおり残す。 */}
          <button
            type="button"
            onClick={() => setIsBrowseSheetOpen(true)}
            className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {t("styleBrowseAll")}
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div
          ref={presetStripRef}
          data-testid="style-preset-strip"
          className={`flex gap-4 overflow-x-auto pb-2 ${
            isPresetStripDragging ? "cursor-grabbing select-none" : "md:cursor-grab"
          }`}
          onMouseDown={handlePresetStripMouseDown}
          onClickCapture={handlePresetStripClickCapture}
          onDragStart={(event) => event.preventDefault()}
        >
          {presets.map((preset) => {
            // 段階解放(drip)で未解放のプリセットはシルエットの「あとで とうじょう」
            // カードとして表示し、選択・生成不可にする(サーバ側でも検証)。
            const isDripLocked = preset.locked === true;
            // ゲストは coordinate 以外のカテゴリを生成できないため、カードを
            // 半透明にして「ログインで生成可能！」ラベルを重ねる。
            const isGuestLockedCard =
              !isDripLocked &&
              effectiveAuthState !== "authenticated" &&
              !preset.category.allowGuestGeneration;
            return (
              <StylePresetPreviewCard
                key={preset.id}
                preset={preset}
                isSelected={!isDripLocked && preset.id === selectedPreset?.id}
                onClick={
                  isDripLocked
                    ? undefined
                    : () => handlePresetSelect(preset.id)
                }
                buttonRef={
                  isDripLocked ? undefined : buildPresetButtonRef(preset.id)
                }
                alt={t("styleCardAlt", { name: preset.title })}
                disabled={isGenerating || isGuestResultLocked}
                locale={styleCardLocale}
                dripLocked={isDripLocked}
                dripLockedLabel={
                  isDripLocked ? t("styleDripLockedLabel") : undefined
                }
                lockedLabel={
                  isGuestLockedCard
                    ? t("guestCategoryLoginAction")
                    : undefined
                }
                generated={
                  !isDripLocked && generatedPresetIdSet.has(preset.id)
                }
                generatedLabel={t("styleGeneratedBadge")}
              />
            );
          })}
        </div>

        {/* 探索シート(チップ+グリッド)。presets はストリップと同一(解放ゲート適用済み)。 */}
        <StyleBrowseSheet
          open={isBrowseSheetOpen}
          onOpenChange={setIsBrowseSheetOpen}
          presets={presets}
          generateCounts={generateCounts ?? {}}
          generateTotals={generateTotals ?? {}}
          favoriteIds={favoritePresetIds}
          onToggleFavorite={(presetId, next) => {
            void toggleFavorite(presetId, next);
          }}
          onSelectPreset={handleSelectFromBrowseSheet}
          isAuthenticated={effectiveAuthState === "authenticated"}
          generatedPresetIds={generatedPresetIdSet}
          locale={styleCardLocale}
          selectedPresetId={selectedPresetId}
        />
      </section>

      <OneTapStyleGenerationForm
        ref={formRef}
        variant="page"
        preset={selectedPreset}
        initialAuthState={initialAuthState}
        requestedModel={requestedModel}
        showResultPanel={showResultPanel}
        subscriptionPlan={subscriptionPlan}
        canUseFreePose={canUseFreePose}
        resolveCategoryKey={resolveCategoryKey}
        onStatusChange={setFormStatus}
      />

      {/*
        共有リンク・URL 直叩きで未開放の ?style= に来たときの保険。
        通常の導線(スタイル紹介ページ・投稿詳細)では押す前にロック表示になる。
      */}
      <AlertDialog open={isLockedRequestOpen} onOpenChange={setIsLockedRequestOpen}>
        <AlertDialogContent data-testid="style-locked-request-notice">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lockedRequestedReason === "login_required"
                ? t("presetLoginRequiredTitle")
                : t("presetLockedTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lockedRequestedReason === "login_required"
                ? t("presetLoginRequiredDescription")
                : lockedRequestedReason === "prerequisite"
                  ? t("presetLockedPrerequisiteDescription")
                  : t("presetLockedSequentialDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {lockedRequestedReason === "login_required" ? (
              <>
                <AlertDialogCancel>{t("presetLockedAction")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setIsLockedRequestOpen(false);
                    formRef.current?.openAuthModal();
                  }}
                >
                  {t("presetLoginRequiredAction")}
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={() => setIsLockedRequestOpen(false)}>
                {t("presetLockedAction")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
