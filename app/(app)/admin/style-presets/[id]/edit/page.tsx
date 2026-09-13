import { connection } from "next/server";
import { notFound } from "next/navigation";

import { listPresetCategories } from "@/features/style-presets/lib/preset-category-repository";
import {
  getStylePresetForAdminById,
  listAllowlistedCreators,
} from "@/features/style-presets/lib/style-preset-repository";
import { StylePresetFormPage } from "../../StylePresetFormPage";

// 管理画面全体の admin 判定は app/(app)/admin/layout.tsx で行っている
export default async function EditStylePresetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
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
