import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { listPopupBanners } from "@/features/popup-banners/lib/popup-banner-repository";
import { PopupBannerListClient } from "./PopupBannerListClient";

export default async function AdminPopupBannersPage() {
  const user = await getUser();
  const adminUserIds = getAdminUserIds();

  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const banners = await listPopupBanners();

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          ポップアップバナー管理
        </h1>
        <p className="mt-1 text-slate-600">
          ホーム画面のオーバーレイ表示バナーを追加・編集・削除できます。
        </p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardHeader className="border-b border-slate-100">
          <CardTitle>一覧とアナリティクス</CardTitle>
          <CardDescription>
            表示順の管理と、日別パフォーマンスの確認ができます。
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 sm:p-8">
          <PopupBannerListClient initialBanners={banners} />
        </CardContent>
      </Card>
    </div>
  );
}
