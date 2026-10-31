import { connection } from "next/server";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { getUser } from "@/lib/auth";
import {
  isAdminViewer,
  isGachaPromptAvailable,
  isGachaSplitAvailable,
  isNameInputAvailable,
  isUserStylesAvailable,
} from "@/lib/env";
import { RefreshOnMount } from "@/components/RefreshOnMount";
import { GenerationFormContainer } from "./GenerationFormContainer";
import { GenerationFormSkeleton } from "./GenerationFormSkeleton";
import { GeneratedImageGallerySkeleton } from "./GeneratedImageGallerySkeleton";
import { CachedGenerationPercoinBalance } from "@/features/credits/components/CachedGenerationPercoinBalance";
import { CachedGeneratedImageGallery } from "./CachedGeneratedImageGallery";
import { GenerationStateProvider } from "@/features/generation/context/GenerationStateContext";
import { getUserProfileServer } from "@/features/my-page/lib/server-api";
import { isInI2iCatalogAllowlist } from "@/lib/auth/i2i-catalog";
import { getCatalogReferenceConsentSummary } from "@/features/catalog-references/lib/consent-repository";
import type { CatalogReferenceAccess } from "@/features/catalog-references/types";
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

  // 見本(参照画像)を使える人か。運営が選んだ人だけ(一覧が空ならだれも使えない。fail-closed)。
  // 使える人だけ、続けて見本の同意の状態を確かめる(有効な同意が無いときだけ同意の画面を、初めてなら案内も出す)。
  // プロフィールの読み込みと並べて走らせ、一般の利用者の読み込みは増やさない
  const [profile, catalogReference] = await Promise.all([
    getUserProfileServer(user.id),
    isInI2iCatalogAllowlist(user.id).then(
      async (available): Promise<CatalogReferenceAccess | undefined> =>
        available ? { userId: user.id, ...(await getCatalogReferenceConsentSummary(user.id)) } : undefined,
    ),
  ]);

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
            gachaPromptAvailable={isGachaPromptAvailable(user.id)}
            gachaSplitAvailable={isGachaSplitAvailable(user.id)}
            // ガチャの上限(囲みの数・候補の数)は、運営だけ掛けない(テストのため)
            gachaUnlimited={isAdminViewer(user.id)}
            // 名前の欄(公開前は運営だけ。docs/planning/name-input-slot-plan.md)
            nameInputAvailable={isNameInputAvailable(user.id)}
            nameInputUnlimited={isAdminViewer(user.id)}
            // 見本の欄(運営が選んだ人だけ。docs/planning/i2i-catalog-review-implementation-plan.md)
            catalogReference={catalogReference}
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
              // カタログ刷新後(公開前は運営だけ)の /free は「カタログをつくる(CREATE)」。一覧には
              // 自分のプロンプトで作ったものだけを出し、ほかの人のプロンプトで作ったものは混ぜない。
              // 一般の利用者は一般公開の日まで今のまま(判定はタブの出し分けと同じ)。
              ownPromptsOnly={isUserStylesAvailable(user.id)}
            />
          </Suspense>
        </div>
      </GenerationStateProvider>
    </>
  );
}
