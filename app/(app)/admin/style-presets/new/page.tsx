import { connection } from "next/server";
import { ensureAdminPage } from "@/lib/admin-page-guard";

import { listPresetCategories } from "@/features/style-presets/lib/preset-category-repository";
import { listAllowlistedCreators } from "@/features/style-presets/lib/style-preset-repository";
import { StylePresetFormPage } from "../StylePresetFormPage";

export default async function NewStylePresetPage() {
  await connection();
  // レイアウトの確認だけでは、ページのデータが先に流れ出る(lib/admin-page-guard.ts)
  await ensureAdminPage();

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
