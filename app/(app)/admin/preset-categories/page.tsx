import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { listPresetCategories } from "@/features/style-presets/lib/preset-category-repository";
import { AdminPresetCategoryListClient } from "@/features/preset-categories/components/AdminPresetCategoryListClient";

export const metadata = {
  title: "プリセットカテゴリ管理 | Admin",
};

export default async function AdminPresetCategoriesPage() {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();
  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  // inactive も含めて表示する (admin は管理対象として全カテゴリを見たい)
  const categories = await listPresetCategories({ includeInactive: true });

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          プリセットカテゴリ管理
        </h1>
        <p className="mt-1 text-slate-600">
          One-Tap Style のカテゴリを管理します。`skip_base_prefix` を true に
          すると共通プロンプトを付与せず、admin が登録した文言だけで生成します。
          `key` は不変なので、誤入力時は新規作成し直してください。
        </p>
      </header>
      <AdminPresetCategoryListClient categories={categories} />
    </div>
  );
}
