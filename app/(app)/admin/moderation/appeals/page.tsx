import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { AppealQueueClient } from "./AppealQueueClient";

/**
 * 異議申立ての審査キュー（管理画面）
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
 *           ADR-005 / REQ-010, REQ-012
 *
 * ページ認証は既存 app/(app)/admin/moderation/page.tsx と同じ
 * getUser() + getAdminUserIds() パターンに揃える（API は requireAdmin()）。
 */
export default async function AdminModerationAppealsPage() {
  await connection();

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
          異議申立て
        </h1>
        <p className="mt-1 text-slate-600">
          公開停止した投稿への異議申立てを審査します。認容すると投稿は公開に戻ります。
        </p>
      </header>

      <Card>
        <CardContent className="p-5">
          <AppealQueueClient />
        </CardContent>
      </Card>
    </div>
  );
}
