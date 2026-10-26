import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { listTimelineEvents } from "@/features/admin-dashboard/lib/timeline-event-repository";
import { TimelineEventsClient } from "./TimelineEventsClient";

export default async function AdminTimelineEventsPage() {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();
  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const events = await listTimelineEvents();

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          出来事の印
        </h1>
        <p className="mt-1 text-slate-600">
          企画・広告・値段の改定・リリースなど「何かを変えた日」を残します。
          ダッシュボードの日ごとのグラフに縦線で出るので、変えた前と後を比べられます。
        </p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <TimelineEventsClient initialEvents={events} />
        </CardContent>
      </Card>
    </div>
  );
}
