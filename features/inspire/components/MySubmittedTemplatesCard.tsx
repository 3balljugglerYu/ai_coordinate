import { getTranslations } from "next-intl/server";
import {
  isInspireFeatureEnabled,
} from "@/lib/env";
import { isInspireSubmitterAllowed } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listOwnStyleTemplates,
  createStyleTemplateSignedUrl,
} from "@/features/inspire/lib/repository";
import { MySubmittedTemplatesCardClient } from "./MySubmittedTemplatesCardClient";

interface MySubmittedTemplatesCardProps {
  userId: string;
}

const SIGNED_URL_TTL_SECONDS = 60 * 30;

/**
 * 申請者ホワイトリストを通過したユーザーにのみ表示される、
 * 自分のテンプレ申請カード。
 *
 * - サーバーコンポーネント: env をクライアントへ漏らさないため
 * - 非該当ユーザーには null を返す（DOM に出ない、REQ-S-11）
 * - 申請ダイアログ起動と取り下げは Client サブコンポーネントが担当
 */
export async function MySubmittedTemplatesCard({
  userId,
}: MySubmittedTemplatesCardProps) {
  if (!isInspireFeatureEnabled()) return null;
  if (!isInspireSubmitterAllowed(userId)) return null;

  const t = await getTranslations("myPage");
  const adminClient = createAdminClient();
  const { data, error } = await listOwnStyleTemplates(adminClient, userId);

  if (error) {
    return (
      <div className="mt-8">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          {t("inspireSectionTitle")}
        </h2>
        <p className="text-sm text-destructive">
          {t("inspireListFetchFailed")}
        </p>
      </div>
    );
  }

  const rows = data ?? [];

  // signed URL を発行（テンプレ画像本体のみ。プレビュー画像は申請者が見るが Phase 4/5 で改善）
  const items = await Promise.all(
    rows.map(async (row) => {
      let signedUrl: string | null = null;
      if (row.storage_path) {
        const result = await createStyleTemplateSignedUrl(
          adminClient,
          row.storage_path,
          SIGNED_URL_TTL_SECONDS
        );
        signedUrl = result.url;
      }
      return {
        id: row.id,
        alt: row.alt,
        moderation_status: row.moderation_status,
        moderation_reason: row.moderation_reason,
        moderation_updated_at: row.moderation_updated_at,
        created_at: row.created_at,
        image_url: signedUrl,
      };
    })
  );

  return (
    <MySubmittedTemplatesCardClient
      items={items}
      copy={{
        title: t("inspireSectionTitle"),
        description: t("inspireSectionDescription"),
        submitButton: t("inspireSubmitButton"),
        emptyState: t("inspireEmptyState"),
        statusDraft: t("inspireStatusDraft"),
        statusPending: t("inspireStatusPending"),
        statusVisible: t("inspireStatusVisible"),
        statusRemoved: t("inspireStatusRemoved"),
        statusWithdrawn: t("inspireStatusWithdrawn"),
        withdrawAction: t("inspireWithdrawAction"),
        withdrawConfirmTitle: t("inspireWithdrawConfirmTitle"),
        withdrawConfirmDescriptionDraft: t(
          "inspireWithdrawConfirmDescriptionDraft"
        ),
        withdrawConfirmDescriptionActive: t(
          "inspireWithdrawConfirmDescriptionActive"
        ),
        withdrawConfirmAction: t("inspireWithdrawConfirmAction"),
        withdrawCancelAction: t("inspireWithdrawCancelAction"),
        withdrawSuccess: t("inspireWithdrawSuccess"),
        withdrawFailed: t("inspireWithdrawFailed"),
      }}
    />
  );
}
