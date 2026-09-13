import { connection } from "next/server";

import { listPresetCategories } from "@/features/style-presets/lib/preset-category-repository";
import { listAllowlistedCreators } from "@/features/style-presets/lib/style-preset-repository";
import { StylePresetFormPage } from "../StylePresetFormPage";

// 管理画面全体の admin 判定は app/(app)/admin/layout.tsx で行っている
export default async function NewStylePresetPage() {
  await connection();

  const [categories, creators] = await Promise.all([
    // 編集時に既存の inactive category を維持できるよう includeInactive=true
    listPresetCategories({ includeInactive: true }),
    listAllowlistedCreators(),
  ]);

  return (
    <StylePresetFormPage
      categories={categories}
      creators={creators}
      headerTitle="スタイルを追加"
    />
  );
}
