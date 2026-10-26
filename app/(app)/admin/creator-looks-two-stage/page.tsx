import { connection } from "next/server";
import { ensureAdminPage } from "@/lib/admin-page-guard";
import { Card, CardContent } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCreatorLooksTwoStageVisibility } from "@/features/inspire/lib/creator-looks-two-stage";
import { CreatorLooksTwoStageForm } from "./CreatorLooksTwoStageForm";

export const metadata = {
  title: "Creator Looks 2段階モード設定 | Admin",
};

/**
 * Creator Looks「2段階(衣装＋背景)生成モード」の公開レベルを管理する admin 設定ページ。
 * admin 認可はレイアウトに加えて、ページの先頭でも行う(lib/admin-page-guard.ts)。
 */
export default async function AdminCreatorLooksTwoStagePage() {
  await connection();
  // レイアウトの確認だけでは、ページのデータが先に流れ出る(lib/admin-page-guard.ts)
  await ensureAdminPage();

  const visibility = await getCreatorLooksTwoStageVisibility(
    createAdminClient(),
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Creator Looks 2段階モード設定
        </h1>
        <p className="text-slate-600">
          「衣装＋背景」の2段階生成モードを、ユーザーに表示するかどうかを切り替えます。
        </p>
      </header>

      <Card>
        <CardContent className="p-6 sm:p-8">
          <CreatorLooksTwoStageForm initialVisibility={visibility} />
        </CardContent>
      </Card>
    </div>
  );
}
