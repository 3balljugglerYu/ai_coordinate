import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { ModerationQueueClient } from "./ModerationQueueClient";

export default async function AdminModerationPage() {
  const user = await getUser();
  const adminUserIds = getAdminUserIds();

  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{ fontFamily: "var(--font-admin-heading), ui-monospace, monospace" }}
        >
          投稿審査キュー
        </h1>
        <p className="mt-1 text-slate-600">
          通報しきい値に達した投稿を審査して、問題なしまたは不適切を選択してください。
        </p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <ModerationQueueClient />
        </CardContent>
      </Card>
    </div>
  );
}
