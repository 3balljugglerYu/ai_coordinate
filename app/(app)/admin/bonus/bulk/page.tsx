import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { Card, CardContent } from "@/components/ui/card";
import { BulkGrantClient } from "./BulkGrantClient";

/**
 * ボーナス一括付与ページ
 * CSVでメールアドレスと付与ペルコイン数を指定し、一括付与する
 */
export default async function AdminBonusBulkPage() {
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
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          ボーナス一括付与
        </h1>
        <p className="mt-1 text-slate-600">
          CSVでメールアドレスと付与ペルコイン数を指定し、一括でペルコインを付与できます。未登録のメールはスキップされます。
        </p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <BulkGrantClient />
        </CardContent>
      </Card>
    </div>
  );
}
