import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { listCreatorAllowlist } from "@/features/creators/lib/creator-allowlist-repository";
import { CreatorAllowlistClient } from "./CreatorAllowlistClient";

export default async function AdminCreatorAllowlistPage() {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();
  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const members = await listCreatorAllowlist();

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          クリエイター招待
        </h1>
        <p className="mt-1 text-slate-600">
          招待クリエイター(allowlist)を管理します。ここに登録された人は
          プロンプト申請(/creators/submit)ができ、One-Tap Style の
          クリエイター(提供者クレジット)選択肢にも表示されます。
        </p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <CreatorAllowlistClient initialMembers={members} />
        </CardContent>
      </Card>
    </div>
  );
}
