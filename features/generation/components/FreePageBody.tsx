import { connection } from "next/server";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { getUser } from "@/lib/auth";
import { RefreshOnMount } from "@/components/RefreshOnMount";
import { GenerationFormContainer } from "./GenerationFormContainer";
import { GenerationFormSkeleton } from "./GenerationFormSkeleton";
import { GeneratedImageGallerySkeleton } from "./GeneratedImageGallerySkeleton";
import { CachedGenerationPercoinBalance } from "@/features/credits/components/CachedGenerationPercoinBalance";
import { CachedGeneratedImageGallery } from "./CachedGeneratedImageGallery";
import { GenerationStateProvider } from "@/features/generation/context/GenerationStateContext";
import { getUserProfileServer } from "@/features/my-page/lib/server-api";
import { type Locale } from "@/i18n/config";
import { FreeGuestLoginCta } from "./FreeGuestLoginCta";

/**
 * /free (じゆうモード) のユーザー依存部分(認証・残高・生成フォーム・生成結果)。
 *
 * じゆうモードはゲスト生成に対応しない(ログイン必須)。未ログイン時は生成フォームを
 * 出さずログイン誘導 CTA のみを表示する。ログイン済みは残高 + フォーム + 生成結果一覧。
 * page.tsx 側の静的ヘッダを即時描画させるため、リクエスト依存(cookie 認証)と DB 取得を
 * このコンポーネントに隔離し <Suspense> でストリーミングする。
 */
export async function FreePageBody() {
  await connection();

  const t = await getTranslations("free");
  const creditsT = await getTranslations("credits");
  const locale = (await getLocale()) as Locale;
  const user = await getUser();

  // 未ログイン: ログイン誘導のみ(ゲスト生成なし)。
  if (user === null) {
    return <FreeGuestLoginCta />;
  }

  const profile = await getUserProfileServer(user.id);

  return (
    <>
      <RefreshOnMount />

      <Suspense
        fallback={
          <div className="mb-6 h-16 w-64 animate-pulse rounded-lg bg-gray-200" />
        }
      >
        <CachedGenerationPercoinBalance
          userId={user.id}
          locale={locale}
          source="free"
          copy={{
            balanceLabel: creditsT("balanceLabel"),
            percoinUnit: creditsT("percoinUnit"),
          }}
        />
      </Suspense>

      <GenerationStateProvider>
        <Suspense fallback={<GenerationFormSkeleton />}>
          <GenerationFormContainer
            subscriptionPlan={profile?.subscription_plan ?? "free"}
            authState="authenticated"
            mode="free"
          />
        </Suspense>

        <div className="mt-8 scroll-mt-20">
          <Suspense fallback={<GeneratedImageGallerySkeleton />}>
            <CachedGeneratedImageGallery
              userId={user.id}
              generationType="free"
              cacheTag={`free-${user.id}`}
              title={t("resultsTitle")}
              detailFromParam="free"
              returnToImageIdKey="persta-ai:free-return-to-image-id"
              applyActionMode="dispatch-event"
            />
          </Suspense>
        </div>
      </GenerationStateProvider>
    </>
  );
}
