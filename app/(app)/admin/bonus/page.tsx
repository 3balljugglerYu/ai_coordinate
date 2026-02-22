import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { Card, CardContent } from "@/components/ui/card";
import { BonusGrantForm } from "./BonusGrantForm";

/**
 * 運営者からのボーナス付与ページ
 * 管理者が特定ユーザーにペルコインを手動で付与する
 */
export default async function AdminBonusPage() {
  // 管理者権限チェック
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
          運営者からのボーナス付与
        </h1>
        <p className="mt-1 text-slate-600">
          特定のユーザーにペルコインを手動で付与できます。付与理由は取引履歴に表示されます。
        </p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <BonusGrantForm />
        </CardContent>
      </Card>
    </div>
  );
}
