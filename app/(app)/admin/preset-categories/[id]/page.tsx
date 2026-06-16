import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import {
  getPresetCategoryById,
  listPresetCategories,
} from "@/features/style-presets/lib/preset-category-repository";
import { AdminPresetCategoryFormClient } from "@/features/preset-categories/components/AdminPresetCategoryFormClient";
import { formatDatetimeLocalJst } from "@/lib/datetime/format-datetime-local-jst";

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

  // 解放ゲートの前提カテゴリ候補: コレクションシリーズのみ・自分自身は除外。
  const allCategories = await listPresetCategories({ includeInactive: false });
  const prerequisiteOptions = allCategories
    .filter((c) => c.isCollectionSeries && c.id !== category.id)
    .map((c) => ({ key: c.key, displayNameJa: c.displayNameJa }));

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
      <AdminPresetCategoryFormClient
        mode="edit"
        initial={category}
        initialCollectionDisplayStartsAtLocal={formatDatetimeLocalJst(
          category.collectionDisplayStartsAt,
        )}
        initialCollectionDisplayEndsAtLocal={formatDatetimeLocalJst(
          category.collectionDisplayEndsAt,
        )}
        prerequisiteOptions={prerequisiteOptions}
      />
    </div>
  );
}
