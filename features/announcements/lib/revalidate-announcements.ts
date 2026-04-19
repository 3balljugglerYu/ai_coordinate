import { revalidatePath } from "next/cache";

export function revalidateAnnouncements(announcementId?: string) {
  revalidatePath("/admin/announcements");
  revalidatePath("/notifications");

  if (announcementId) {
    revalidatePath(`/notifications/announcements/${announcementId}`);
  }
}
