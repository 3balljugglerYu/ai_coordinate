import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
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
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">投稿審査キュー</h1>
        <p className="text-muted-foreground">
          通報しきい値に達した投稿を審査して、問題なしまたは不適切を選択してください。
        </p>
      </div>

      <Card className="p-6">
        <ModerationQueueClient />
      </Card>
    </div>
  );
}
