import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { AuditLogClient } from "./AuditLogClient";

export default async function AdminAuditLogPage() {
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
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          管理者操作ログ
        </h1>
        <p className="mt-1 text-slate-600">
          ボーナス付与、審査判定、ユーザー停止・復帰などの操作履歴を確認できます。
        </p>
      </header>

      <AuditLogClient />
    </div>
  );
}
