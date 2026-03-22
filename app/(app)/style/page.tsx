import { getTranslations } from "next-intl/server";
import { StylePageClient } from "@/features/style/components/StylePageClient";
import { StylePageShareButton } from "@/features/style/components/StylePageShareButton";
import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";

export default async function StylePage() {
  const t = await getTranslations("style");
  const presets = await getPublishedStylePresets();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 pb-8 pt-6 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-3xl font-bold text-gray-900">
                {t("pageTitle")}
              </h1>
              <StylePageShareButton />
            </div>
            <p className="text-sm font-medium text-gray-700">
              {t("pageDescription")}
            </p>
          </div>

          <StylePageClient presets={presets} />
        </div>
      </div>
    </div>
  );
}
