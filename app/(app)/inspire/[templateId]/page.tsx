import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { isInspireFeatureEnabled } from "@/lib/env";
import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createStyleTemplateSignedUrl,
  getStyleTemplateById,
} from "@/features/inspire/lib/repository";
import { InspirePageClient } from "@/features/inspire/components/InspirePageClient";
import { CachedGeneratedImageGallery } from "@/features/generation/components/CachedGeneratedImageGallery";
import { GeneratedImageGallerySkeleton } from "@/features/generation/components/GeneratedImageGallerySkeleton";
import { GenerationStateProvider } from "@/features/generation/context/GenerationStateContext";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { createMarketingPageMetadata } from "@/lib/metadata";

const SIGNED_URL_TTL_SECONDS = 60 * 30;

interface InspirePageProps {
  params: Promise<{ templateId: string }>;
}

export async function generateMetadata({
  params,
}: InspirePageProps): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const t = await getTranslations("inspirePage");
  const { templateId } = await params;

  return createMarketingPageMetadata({
    title: t("pageTitle"),
    description: t("pageDescription"),
    path: `/inspire/${templateId}`,
    locale,
  });
}

export default async function InspirePage({ params }: InspirePageProps) {
  if (!isInspireFeatureEnabled()) {
    notFound();
  }

  const { templateId } = await params;
  const user = await requireAuth();

  const adminClient = createAdminClient();
  const { data: template, error } = await getStyleTemplateById(
    adminClient,
    templateId
  );

  if (error || !template) {
    notFound();
  }

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

  // 申請者のプロフィール情報（admin Sheet と同じパターンで一括取得）
  const { data: profile } = await adminClient
    .from("profiles")
    .select("user_id, nickname, avatar_url")
    .eq("user_id", template.submitted_by_user_id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 pb-8 pt-6 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900">
              {t("pageTitle")}
            </h1>
            <p className="text-sm font-medium text-gray-700">
              {t("pageDescription")}
            </p>
          </div>

          <GenerationStateProvider>
            <InspirePageClient
              template={{
                id: template.id,
                alt: template.alt,
                image_url: templateImageUrl,
                submitted_by_user_id: template.submitted_by_user_id,
              }}
              submitter={{
                nickname: profile?.nickname ?? null,
                avatar_url: profile?.avatar_url ?? null,
              }}
              copy={{
              formTitle: t("formTitle"),
              formDescription: t("formDescription"),
              formImageLabel: t("formImageLabel"),
              formCountLabel: t("formCountLabel"),
              formModelLabel: t("formModelLabel"),
              formGenerateButton: t("formGenerateButton"),
              formGenerateButtonWithCost: t("formGenerateButtonWithCost"),
              formGenerating: t("formGenerating"),
              formImageRequired: t("formImageRequired"),
              formGenerationFailed: t("formGenerationFailed"),
              submittedByLabel: t("submittedByLabel"),
              submitterAnonymous: t("submitterAnonymous"),
              submitterViewProfile: t("submitterViewProfile"),
              selectedTemplateLabel: t("selectedTemplateLabel"),
              formGenerateAria: t("formGenerateAria"),
              formCharacterUploadHint: t("formCharacterUploadHint"),
              formUploadLabel: t("formUploadLabel"),
              formAddImageAction: t("formAddImageAction"),
              overrideLabel: t("overrideLabel"),
              overrideHint: t("overrideHint"),
              overrideAngle: t("overrideAngle"),
              overridePose: t("overridePose"),
              overrideOutfit: t("overrideOutfit"),
              overrideBackground: t("overrideBackground"),
              statusFailed: t("statusFailed"),
              statusFailedDescription: t("statusFailedDescription"),
              resultsTitle: t("resultsTitle"),
              resultsPlaceholder: t("resultsPlaceholder"),
              resultImageAlt: t("resultImageAlt"),
            }}
            />

            <div className="mt-8">
              <Suspense fallback={<GeneratedImageGallerySkeleton />}>
                <CachedGeneratedImageGallery
                  userId={user.id}
                  generationType="inspire"
                  cacheTag={`inspire-${user.id}`}
                  title={t("resultsTitle")}
                  detailFromParam="coordinate"
                  returnToImageIdKey="persta-ai:inspire-return-to-image-id"
                  applyActionMode="navigate-coordinate"
                />
              </Suspense>
            </div>
          </GenerationStateProvider>
        </div>
      </div>
    </div>
  );
}
