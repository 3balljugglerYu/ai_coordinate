import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { Card } from "@/components/ui/card";
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
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">運営者からのボーナス付与</h1>
        <p className="text-muted-foreground">
          特定のユーザーにペルコインを手動で付与できます。付与理由は取引履歴に表示されます。
        </p>
      </div>

      <Card className="p-6">
        <BonusGrantForm />
      </Card>
    </div>
  );
}
