import { revalidatePath, revalidateTag } from "next/cache";

export function revalidateAnnouncements(announcementId?: string) {
  revalidateTag("announcements", { expire: 0 });
  revalidatePath("/admin/announcements");
  revalidatePath("/notifications");

  if (announcementId) {
    revalidatePath(`/notifications/announcements/${announcementId}`);
  }
}
