import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { listPushBroadcastsForAdmin } from "@/features/push-broadcasts/lib/push-broadcast-repository";
import { PushBroadcastClient } from "./PushBroadcastClient";

export default async function AdminPushBroadcastsPage() {
  const user = await getUser();
  const adminUserIds = getAdminUserIds();

  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const broadcasts = await listPushBroadcastsForAdmin();

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          プッシュ通知の配信
        </h1>
        <p className="mt-1 text-slate-600">
          アプリを入れている人へ、運営からのお知らせをプッシュ通知で送ります。
          届くのは、アプリの通知設定で「運営からのお知らせ」をオンにしている人だけです（既定はオフ）。
          お知らせページと一緒に送るときは「運営お知らせ」の「プッシュ通知も送る」を使ってください。
        </p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <PushBroadcastClient initialBroadcasts={broadcasts} />
        </CardContent>
      </Card>
    </div>
  );
}
