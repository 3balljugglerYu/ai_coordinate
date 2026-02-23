import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { BannerListClient } from "./BannerListClient";
import type { Banner } from "@/features/banners/lib/schema";

export default async function AdminBannersPage() {
  const user = await getUser();
  const adminUserIds = getAdminUserIds();

  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const supabase = createAdminClient();
  const { data: banners } = await supabase
    .from("banners")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          バナー管理
        </h1>
        <p className="mt-1 text-slate-600">
          ホーム画面に表示するバナーを追加・編集・削除できます。
        </p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <BannerListClient initialBanners={(banners ?? []) as Banner[]} />
        </CardContent>
      </Card>
    </div>
  );
}
