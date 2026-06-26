import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import {
  listAllowlistedCreators,
  listStylePresetsForAdmin,
} from "@/features/style-presets/lib/style-preset-repository";
import { listPresetCategories } from "@/features/style-presets/lib/preset-category-repository";
import { StylePresetListClient } from "./StylePresetListClient";
import { CreatorPromptReviewPanel } from "./CreatorPromptReviewPanel";

export default async function AdminStylePresetsPage() {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();

  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const [presets, categories, creators] = await Promise.all([
    listStylePresetsForAdmin(),
    // 編集時に既存の inactive category を維持できるよう includeInactive=true
    listPresetCategories({ includeInactive: true }),
    // クリエイター(提供者クレジット)選択肢 = 招待クリエイター(allowlist)。
    listAllowlistedCreators(),
  ]);

  // クリエイター提供プロンプトの申請(pending かつ申請者あり)を審査パネルに出す。
  const pendingCreatorPresets = presets.filter(
    (preset) =>
      preset.status === "pending" && preset.submittedByUserId !== null
  );

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          One-Tap Style 管理
        </h1>
        <p className="mt-1 text-slate-600">
          <a
            href="/style"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-900"
          >
            /style
          </a>
          に表示するスタイルを追加・編集・削除・並び替えできます。
        </p>
      </header>

      <CreatorPromptReviewPanel pendingPresets={pendingCreatorPresets} />

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <StylePresetListClient
            initialPresets={presets}
            categories={categories}
            creators={creators}
          />
        </CardContent>
      </Card>
    </div>
  );
}
