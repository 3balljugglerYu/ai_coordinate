import { connection } from "next/server";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { getUser } from "@/lib/auth";
import { isAdminViewer } from "@/lib/env";
import { RefreshOnMount } from "@/components/RefreshOnMount";
import { GenerationFormContainer } from "./GenerationFormContainer";
import { GenerationFormSkeleton } from "./GenerationFormSkeleton";
import { GeneratedImageGallerySkeleton } from "./GeneratedImageGallerySkeleton";
import { CachedGenerationPercoinBalance } from "@/features/credits/components/CachedGenerationPercoinBalance";
import { CachedGeneratedImageGallery } from "./CachedGeneratedImageGallery";
import { GenerationStateProvider } from "@/features/generation/context/GenerationStateContext";
import { getUserProfileServer } from "@/features/my-page/lib/server-api";
import { type Locale } from "@/i18n/config";
import { CoordinateGuestLoginCta } from "./CoordinateGuestLoginCta";
import {
  CoordinateGeneratedListHashScroll,
  COORDINATE_GENERATED_LIST_ID,
} from "./CoordinateGeneratedListHashScroll";

/**
 * /coordinate のユーザー依存部分(認証・残高・生成フォーム・生成結果)。
 *
 * page.tsx 側の静的ヘッダ(タイトル/説明)を即時描画させるため、リクエスト依存
 * (cookie 経由の認証)と DB 取得をこのコンポーネントに隔離し、<Suspense> の
 * 子としてストリーミングする。connection() はこの動的領域内で呼ぶ。
 */
export async function CoordinatePageBody() {
  await connection();

  const t = await getTranslations("coordinate");
  const creditsT = await getTranslations("credits");
  const locale = (await getLocale()) as Locale;
  // Phase 6 / UCL-005: 未ログインユーザーも /coordinate を開けるようにする。
  const user = await getUser();
  const isGuest = user === null;
  const profile = isGuest ? null : await getUserProfileServer(user.id);

  return (
    <>
      {!isGuest ? <RefreshOnMount /> : null}

      {isGuest ? (
        // UCL-005: 未ログイン時は上部にログイン誘導 CTA を常時表示
        <CoordinateGuestLoginCta />
      ) : (
        // ペルコイン残高と購入リンク
        <Suspense
          fallback={
            <div className="mb-6 h-16 animate-pulse rounded-lg bg-gray-200" />
          }
        >
          <CachedGenerationPercoinBalance
            userId={user.id}
            locale={locale}
            source="coordinate"
            copy={{
              balanceLabel: creditsT("balanceLabel"),
              percoinUnit: creditsT("percoinUnit"),
            }}
          />
        </Suspense>
      )}

      {/* GenerationForm と 生成結果一覧を GenerationStateProvider でラップ */}
      <GenerationStateProvider>
        <Suspense fallback={<GenerationFormSkeleton />}>
          <GenerationFormContainer
            subscriptionPlan={profile?.subscription_plan ?? "free"}
            authState={isGuest ? "guest" : "authenticated"}
            // framing_mode (free_pose) は admin viewer 限定の先行公開 (サーバ側でも検証)
            canUseFreePose={isAdminViewer(user?.id ?? null)}
          />
        </Suspense>

        {/* 生成結果一覧 (認証ユーザーのみ。ゲストは GuestResultPreview を見る) */}
        {!isGuest ? (
          <div id={COORDINATE_GENERATED_LIST_ID} className="mt-8 scroll-mt-20">
            <CoordinateGeneratedListHashScroll />
            <Suspense fallback={<GeneratedImageGallerySkeleton />}>
              <CachedGeneratedImageGallery
                userId={user.id}
                generationType="coordinate"
                cacheTag={`coordinate-${user.id}`}
                title={t("resultsTitle")}
                detailFromParam="coordinate"
                returnToImageIdKey="persta-ai:coordinate-return-to-image-id"
                applyActionMode="dispatch-event"
              />
            </Suspense>
          </div>
        ) : null}
      </GenerationStateProvider>
    </>
  );
}
