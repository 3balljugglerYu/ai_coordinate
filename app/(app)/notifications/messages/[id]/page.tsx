import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { PersonalNoticeDetailScreen } from "@/features/notifications/components/PersonalNoticeDetailScreen";
import { getPersonalNoticeDetailForUser } from "@/features/notifications/lib/personal-notice-detail";

interface PersonalNoticeDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

/**
 * 個人あてのお知らせの詳細。本人以外・取り消し済みは 404(PN-012)
 */
export default async function PersonalNoticeDetailPage({
  params,
}: PersonalNoticeDetailPageProps) {
  await connection();

  const [{ id }, localeValue, user] = await Promise.all([
    params,
    getLocale(),
    requireAuth(),
  ]);
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const notice = await getPersonalNoticeDetailForUser(createAdminClient(), {
    notificationId: id,
    userId: user.id,
    locale,
  });

  if (!notice) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="px-4 pb-8 pt-6 md:pt-8">
        <div className="mx-auto max-w-3xl">
          <PersonalNoticeDetailScreen notice={notice} />
        </div>
      </div>
    </div>
  );
}
