import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnnouncementList } from "@/features/announcements/components/AnnouncementList";
import { listPublishedAnnouncementsForUser } from "@/features/announcements/lib/announcement-repository";
import { decorateAnnouncementSummary } from "@/features/announcements/lib/presentation";
import type { Locale } from "@/i18n/config";

interface CachedAnnouncementListProps {
  userId: string;
  locale: Locale;
}

export async function CachedAnnouncementList({
  userId,
  locale,
}: CachedAnnouncementListProps) {
  "use cache";
  cacheTag("announcements", `announcements-${userId}`, `announcements-${userId}-${locale}`);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const announcements = await listPublishedAnnouncementsForUser(userId, supabase);

  return (
    <AnnouncementList
      initialAnnouncements={announcements.map((announcement) =>
        decorateAnnouncementSummary(announcement, locale)
      )}
    />
  );
}
