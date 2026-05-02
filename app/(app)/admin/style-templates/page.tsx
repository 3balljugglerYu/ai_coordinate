import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createStyleTemplateSignedUrls,
  listStyleTemplatesByStatus,
  type UserStyleTemplateRow,
} from "@/features/inspire/lib/repository";
import { AdminStyleTemplatesClient } from "./AdminStyleTemplatesClient";

const SIGNED_URL_TTL_SECONDS = 60 * 30;

export default async function AdminStyleTemplatesPage() {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();
  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const t = await getTranslations("adminStyleTemplates");
  const adminClient = createAdminClient();

  const [pending, visible, removed] = await Promise.all([
    listStyleTemplatesByStatus(adminClient, "pending", { limit: 100 }),
    listStyleTemplatesByStatus(adminClient, "visible", { limit: 100 }),
    listStyleTemplatesByStatus(adminClient, "removed", { limit: 100 }),
  ]);

  // signed URL を一括発行（レビュー指摘 #5: tab 単位ではなく全行分まとめて発行）
  const enrichRows = async (rows: UserStyleTemplateRow[]) => {
    const paths = rows.flatMap((row) =>
      [
        row.storage_path,
        row.preview_openai_image_url,
        row.preview_gemini_image_url,
      ].filter((p): p is string => typeof p === "string" && p.length > 0)
    );
    const { urls } = await createStyleTemplateSignedUrls(
      adminClient,
      paths,
      SIGNED_URL_TTL_SECONDS
    );
    const pathToUrl = new Map<string, string | null>();
    paths.forEach((p, i) => pathToUrl.set(p, urls[i] ?? null));
    const sign = (path: string | null) =>
      path ? pathToUrl.get(path) ?? null : null;

    return rows.map((row) => ({
      id: row.id,
      submitted_by_user_id: row.submitted_by_user_id,
      alt: row.alt,
      moderation_status: row.moderation_status,
      moderation_reason: row.moderation_reason,
      moderation_updated_at: row.moderation_updated_at,
      moderation_decided_by: row.moderation_decided_by,
      display_order: row.display_order,
      created_at: row.created_at,
      image_url: sign(row.storage_path),
      preview_openai_image_url: sign(row.preview_openai_image_url),
      preview_gemini_image_url: sign(row.preview_gemini_image_url),
    }));
  };

  const items = {
    pending: await enrichRows(pending.data ?? []),
    visible: await enrichRows(visible.data ?? []),
    removed: await enrichRows(removed.data ?? []),
  };

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          {t("pageTitle")}
        </h1>
        <p className="mt-1 text-slate-600">{t("pageDescription")}</p>
      </header>

      <AdminStyleTemplatesClient
        initialItems={items}
        copy={{
          tabPending: t("tabPending"),
          tabActive: t("tabActive"),
          tabRemoved: t("tabRemoved"),
          submittedAt: t("submittedAt"),
          submitterId: t("submitterId"),
          moderationReason: t("moderationReason"),
          actionApprove: t("actionApprove"),
          actionReject: t("actionReject"),
          actionUnpublish: t("actionUnpublish"),
          reasonPlaceholder: t("reasonPlaceholder"),
          confirmTitle: t("confirmTitle"),
          confirmAction: t("confirmAction"),
          confirmCancel: t("confirmCancel"),
          decisionSuccess: t("decisionSuccess"),
          decisionFailed: t("decisionFailed"),
          orderUpdateSuccess: t("orderUpdateSuccess"),
          orderUpdateFailed: t("orderUpdateFailed"),
          moveUp: t("moveUp"),
          moveDown: t("moveDown"),
          emptyPending: t("emptyPending"),
          emptyActive: t("emptyActive"),
          emptyRemoved: t("emptyRemoved"),
          detailLabel: t("detailLabel"),
          detailClose: t("detailClose"),
          detailTemplate: t("detailTemplate"),
          detailPreviewOpenAI: t("detailPreviewOpenAI"),
          detailPreviewGemini: t("detailPreviewGemini"),
        }}
      />
    </div>
  );
}
