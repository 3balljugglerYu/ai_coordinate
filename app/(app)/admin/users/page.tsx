import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { UserSearchClient } from "./UserSearchClient";

export default async function AdminUsersPage() {
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
          ユーザー検索
        </h1>
        <p className="mt-1 text-slate-600">
          ユーザーIDまたはニックネームで検索するか、一覧から選択して、生成画像・投稿・コメント・ペルコイン取引を確認できます。
        </p>
      </header>

      <UserSearchClient />
    </div>
  );
}
