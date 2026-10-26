import { connection } from "next/server";
import { ensureAdminPage } from "@/lib/admin-page-guard";
import { notFound } from "next/navigation";

import { listPresetCategories } from "@/features/style-presets/lib/preset-category-repository";
import {
  getStylePresetForAdminById,
  listAllowlistedCreators,
} from "@/features/style-presets/lib/style-preset-repository";
import { StylePresetFormPage } from "../../StylePresetFormPage";

export default async function EditStylePresetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  // レイアウトの確認だけでは、ページのデータが先に流れ出る(lib/admin-page-guard.ts)
  await ensureAdminPage();
  const { id } = await params;

  const [preset, categories, creators] = await Promise.all([
    getStylePresetForAdminById(id),
    listPresetCategories({ includeInactive: true }),
    listAllowlistedCreators(),
  ]);

  if (!preset) {
    notFound();
  }

  return (
    <StylePresetFormPage
      preset={preset}
      categories={categories}
      creators={creators}
      headerTitle="スタイルを編集"
    />
  );
}
