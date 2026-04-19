import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requireAuth } from "@/lib/auth";
import { AnnouncementDetailScreen } from "@/features/announcements/components/AnnouncementDetailScreen";
import { getPublishedAnnouncementDetailForUser } from "@/features/announcements/lib/announcement-repository";
import { decorateAnnouncementDetail } from "@/features/announcements/lib/presentation";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

interface AnnouncementDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AnnouncementDetailPage({
  params,
}: AnnouncementDetailPageProps) {
  const { id } = await params;
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const user = await requireAuth();
  const announcement = await getPublishedAnnouncementDetailForUser(id, user.id);

  if (!announcement) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="px-4 pb-8 pt-6 md:pt-8">
        <div className="mx-auto max-w-3xl">
          <AnnouncementDetailScreen
            announcement={decorateAnnouncementDetail(announcement, locale)}
          />
        </div>
      </div>
    </div>
  );
}
