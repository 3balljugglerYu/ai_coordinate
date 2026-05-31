import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { AdminPresetCategoryFormClient } from "@/features/preset-categories/components/AdminPresetCategoryFormClient";

export const metadata = {
  title: "プリセットカテゴリ新規作成 | Admin",
};

export default async function AdminPresetCategoryNewPage() {
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
          プリセットカテゴリ新規作成
        </h1>
        <p className="mt-1 text-slate-600">
          作成後 `key` は変更できません。slug 形式 (小文字英数字 + `_`、先頭は英字) で入力してください。
        </p>
      </header>
      <AdminPresetCategoryFormClient mode="create" />
    </div>
  );
}
