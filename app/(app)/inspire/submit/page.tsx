import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { env, isInspireFeatureEnabled } from "@/lib/env";
import { isInspireSubmitterAllowed, requireAuth } from "@/lib/auth";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { createMarketingPageMetadata } from "@/lib/metadata";
import { UserStyleTemplateSubmissionForm } from "@/features/inspire/components/UserStyleTemplateSubmissionForm";

interface InspireSubmitPageProps {
  searchParams: Promise<{ replace?: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const t = await getTranslations("inspireSubmission");

  return createMarketingPageMetadata({
    title: t("dialogTitle"),
    description: t("dialogDescription"),
    path: "/inspire/submit",
    locale,
  });
}

/**
 * inspire 申請ページ。旧 `UserStyleTemplateSubmissionDialog`（モーダル）を 1 画面に置き換え。
 *
 * ゲート:
 *   - 機能フラグ (`NEXT_PUBLIC_INSPIRE_ENABLED`) → 無効なら 404
 *   - 認証必須（`requireAuth()` が未認証時に /login へリダイレクト）
 *   - 申請ホワイトリスト（`isInspireSubmitterAllowed`）→ 不許可なら /my-page へリダイレクト
 *     （マイページ側で「新しいテンプレートを申請」ボタンが表示されない人がレシピを叩いた場合のフォールバック）
 *
 * 「再申請」フローでは `?replace=<old-template-id>` を渡すと submit 成功時に古い行を上書き削除する
 * （マイページのカードの「再申請」ボタンから渡される）。
 */
export default async function InspireSubmitPage({
  searchParams,
}: InspireSubmitPageProps) {
  if (!isInspireFeatureEnabled()) {
    notFound();
  }

  const user = await requireAuth();

  if (!isInspireSubmitterAllowed(user.id)) {
    redirect("/my-page");
  }

  const { replace } = await searchParams;
  const replaceTemplateId =
    typeof replace === "string" && replace.length > 0 ? replace : null;

  const testCharacterImageUrl = env.INSPIRE_TEST_CHARACTER_IMAGE_URL || null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 pb-8 pt-6 md:pb-10 md:pt-8">
        <UserStyleTemplateSubmissionForm
          testCharacterImageUrl={testCharacterImageUrl}
          replaceTemplateId={replaceTemplateId}
        />
      </div>
    </div>
  );
}
