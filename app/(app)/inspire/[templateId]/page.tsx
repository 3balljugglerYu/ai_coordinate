import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isInspireFeatureEnabled } from "@/lib/env";
import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createStyleTemplateSignedUrl,
  getStyleTemplateById,
} from "@/features/inspire/lib/repository";
import { InspirePageClient } from "@/features/inspire/components/InspirePageClient";

const SIGNED_URL_TTL_SECONDS = 60 * 30;

interface InspirePageProps {
  params: Promise<{ templateId: string }>;
}

export default async function InspirePage({ params }: InspirePageProps) {
  if (!isInspireFeatureEnabled()) {
    notFound();
  }

  const { templateId } = await params;
  await requireAuth();

  const adminClient = createAdminClient();
  const { data: template, error } = await getStyleTemplateById(
    adminClient,
    templateId
  );

  if (error || !template) {
    notFound();
  }

  // 公開行のみ利用可能（owner / admin の閲覧は別 UI で対応、REQ-G-01）
  if (template.moderation_status !== "visible") {
    notFound();
  }

  const t = await getTranslations("inspirePage");

  let templateImageUrl: string | null = null;
  if (template.storage_path) {
    const result = await createStyleTemplateSignedUrl(
      adminClient,
      template.storage_path,
      SIGNED_URL_TTL_SECONDS
    );
    templateImageUrl = result.url;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 space-y-1">
        <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">
          {t("pageTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("pageDescription")}</p>
      </div>

      <InspirePageClient
        template={{
          id: template.id,
          alt: template.alt,
          image_url: templateImageUrl,
          submitted_by_user_id: template.submitted_by_user_id,
        }}
        copy={{
          formTitle: t("formTitle"),
          formDescription: t("formDescription"),
          formImageLabel: t("formImageLabel"),
          formCountLabel: t("formCountLabel"),
          formModelLabel: t("formModelLabel"),
          formGenerateButton: t("formGenerateButton"),
          formGenerating: t("formGenerating"),
          formImageRequired: t("formImageRequired"),
          formGenerationFailed: t("formGenerationFailed"),
          submittedByLabel: t("submittedByLabel"),
        }}
      />
    </div>
  );
}
