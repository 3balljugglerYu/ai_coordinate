import { connection } from "next/server";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { RefreshOnMount } from "@/components/RefreshOnMount";
import { StylePageClient } from "./StylePageClient";
import { GuestGenerationTrialCta } from "@/features/generation/components/GuestGenerationTrialCta";
import { CachedGeneratedImageGallery } from "@/features/generation/components/CachedGeneratedImageGallery";
import { CachedGenerationPercoinBalance } from "@/features/credits/components/CachedGenerationPercoinBalance";
import { GeneratedImageGallerySkeleton } from "@/features/generation/components/GeneratedImageGallerySkeleton";
import { GenerationStateProvider } from "@/features/generation/context/GenerationStateContext";
import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";
import { type Locale } from "@/i18n/config";
import { getUser } from "@/lib/auth";
import { isAdminViewer } from "@/lib/env";
import { getUserProfileServer } from "@/features/my-page/lib/server-api";
import { createClient } from "@/lib/supabase/server";
import { resolveCollectionUnlockContext } from "@/features/collections/lib/collection-unlock-server";
import { categoryNeedsUnlockContext } from "@/features/collections/lib/collection-unlock";
import {
  applyCollectionUnlockGating,
  type CollectionUnlockContext,
} from "@/features/collections/lib/collection-unlock-gating";

// ゲート対象カテゴリが無い/未ログイン時に使う空コンテキスト(除去・解放判定とも no-op)。
const EMPTY_UNLOCK_CONTEXT: CollectionUnlockContext = {
  prerequisiteCompletedKeys: new Set(),
  distinctGeneratedByCategoryKey: new Map(),
};

interface StylePageBodyProps {
  searchParams?: Promise<{
    style?: string;
  }>;
}

/**
 * /style のユーザー依存部分(認証状態・プリセット・プロフィール・生成結果)。
 *
 * page.tsx 側の静的ヘッダ(タイトル/説明)を即時描画させるため、リクエスト依存
 * (cookie 経由の認証)と DB 取得をこのコンポーネントに隔離し、<Suspense> の
 * 子としてストリーミングする。connection() はこの動的領域内で呼ぶ。
 */
export async function StylePageBody({ searchParams }: StylePageBodyProps) {
  await connection();

  const t = await getTranslations("style");
  const coordinateT = await getTranslations("coordinate");
  const creditsT = await getTranslations("credits");
  const locale = (await getLocale()) as Locale;
  const user = await getUser();
  const isAdminViewerFlag = isAdminViewer(user?.id ?? null);
  const cachedPresets = await getPublishedStylePresets({
    includeAdminOnly: isAdminViewerFlag,
  });
  // 解放ゲート(unlock gating)はユーザー依存のため、グローバルキャッシュの外で適用する。
  //  - 前提条件カテゴリ未完走 → 解放対象カテゴリのプリセットを一覧から除去
  //  - 完走済み → 段階解放(drip)で未解放ぶんに locked フラグを立てる
  // 解放ゲート対象カテゴリ(前提カテゴリ付き or sequential)が一覧に無ければ完全 no-op。
  // その場合は authed client の生成すらスキップする(従来カテゴリのみのときの無駄を避ける)。
  const hasGatedCategory = cachedPresets.some((preset) =>
    categoryNeedsUnlockContext(preset.category),
  );
  const presets =
    user && hasGatedCategory
      ? applyCollectionUnlockGating(
          cachedPresets,
          await resolveCollectionUnlockContext(
            cachedPresets,
            user.id,
            await createClient(),
            { includeAdminOnly: isAdminViewerFlag },
          ),
        )
      : applyCollectionUnlockGating(cachedPresets, EMPTY_UNLOCK_CONTEXT);
  const profile = user ? await getUserProfileServer(user.id) : null;
  const params = (await searchParams) ?? {};

  return (
    <>
      {/* coordinate と同様、ログイン時はマウント時に router.refresh() して
          クライアント Router Cache を最新化し、残高が毎回スケルトンに
          戻らないようにする。 */}
      {user ? <RefreshOnMount /> : null}

      {!user ? (
        <GuestGenerationTrialCta
          title={t("guestLoginCtaTitle")}
          description={t("guestLoginCtaDescription")}
          actionLabel={t("guestLoginCtaAction")}
          testId="style-guest-login-cta"
        />
      ) : (
        // ペルコイン残高と購入リンク（コーディネートと共通コンポーネント）
        <Suspense
          fallback={
            <div className="mb-6 h-16 w-64 animate-pulse rounded-lg bg-gray-200" />
          }
        >
          <CachedGenerationPercoinBalance
            userId={user.id}
            locale={locale}
            source="style"
            copy={{
              balanceLabel: creditsT("balanceLabel"),
              percoinUnit: creditsT("percoinUnit"),
            }}
          />
        </Suspense>
      )}

      {/*
        StylePageClient と生成結果一覧を GenerationStateProvider で
        包むことで、/coordinate と同じく生成中はリスト側にスケルトンが
        出る。StylePageClient 内部で setIsGenerating / setGeneratingCount を
        呼ぶことでギャラリーが状態を購読する。
      */}
      <GenerationStateProvider>
        <StylePageClient
          presets={presets}
          initialAuthState={user ? "authenticated" : "guest"}
          initialSelectedPresetId={params.style ?? null}
          // ログインユーザーは生成結果一覧（下に並ぶ <CachedGeneratedImageGallery>）
          // が結果表示を担うため、即時結果パネルは非表示にする。
          showResultPanel={!user}
          subscriptionPlan={profile?.subscription_plan ?? "free"}
          // framing_mode (free_pose) は admin viewer 限定の先行公開 (サーバ側でも検証)
          canUseFreePose={isAdminViewerFlag}
        />

        {/* 生成結果一覧（認証ユーザーのみ）。/coordinate と同じ UI を再利用。 */}
        {user ? (
          <div className="mt-8 scroll-mt-20">
            <Suspense fallback={<GeneratedImageGallerySkeleton />}>
              <CachedGeneratedImageGallery
                userId={user.id}
                generationType="one_tap_style"
                cacheTag={`style-${user.id}`}
                title={coordinateT("resultsTitle")}
                detailFromParam="style"
                returnToImageIdKey="persta-ai:style-return-to-image-id"
                applyActionMode="navigate-coordinate"
              />
            </Suspense>
          </div>
        ) : null}
      </GenerationStateProvider>
    </>
  );
}
