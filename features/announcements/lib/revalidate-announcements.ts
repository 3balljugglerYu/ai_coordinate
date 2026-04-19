import { revalidatePath, revalidateTag } from "next/cache";

export function revalidateAnnouncements(announcementId?: string) {
  revalidateTag("announcements", "max");
  revalidatePath("/admin/announcements");
  revalidatePath("/notifications");

  if (announcementId) {
    revalidatePath(`/notifications/announcements/${announcementId}`);
  }
}
