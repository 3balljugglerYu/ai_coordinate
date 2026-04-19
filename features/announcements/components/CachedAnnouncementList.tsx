import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnnouncementList } from "@/features/announcements/components/AnnouncementList";
import { listPublishedAnnouncementsForUser } from "@/features/announcements/lib/announcement-repository";

interface CachedAnnouncementListProps {
  userId: string;
}

export async function CachedAnnouncementList({
  userId,
}: CachedAnnouncementListProps) {
  "use cache";
  cacheTag("announcements", `announcements-${userId}`);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const announcements = await listPublishedAnnouncementsForUser(userId, supabase);

  return <AnnouncementList initialAnnouncements={announcements} />;
}
