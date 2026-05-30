import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { getPresetCategoryById } from "@/features/style-presets/lib/preset-category-repository";
import { AdminPresetCategoryFormClient } from "@/features/preset-categories/components/AdminPresetCategoryFormClient";

export const metadata = {
  title: "プリセットカテゴリ編集 | Admin",
};

export default async function AdminPresetCategoryEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();
  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const { id } = await params;
  const category = await getPresetCategoryById(id);
  if (!category) {
    notFound();
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
          プリセットカテゴリ編集
        </h1>
        <p className="mt-1 text-slate-600">
          `key` は不変です (変更したい場合は新規作成 + 旧 category を inactive にしてください)。
        </p>
      </header>
      <AdminPresetCategoryFormClient mode="edit" initial={category} />
    </div>
  );
}
