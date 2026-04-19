import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { listAnnouncementsForAdmin } from "@/features/announcements/lib/announcement-repository";
import { AnnouncementListClient } from "./AnnouncementListClient";

export default async function AdminAnnouncementsPage() {
  const user = await getUser();
  const adminUserIds = getAdminUserIds();

  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const announcements = await listAnnouncementsForAdmin();

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          運営お知らせ
        </h1>
        <p className="mt-1 text-slate-600">
          <a
            href="/notifications?tab=announcements"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-900"
          >
            /notifications?tab=announcements
          </a>
          に表示するお知らせを追加・編集・削除できます。
        </p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <AnnouncementListClient initialAnnouncements={announcements} />
        </CardContent>
      </Card>
    </div>
  );
}
