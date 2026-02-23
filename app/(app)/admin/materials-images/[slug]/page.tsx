import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds, getSiteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { MaterialImageListClient } from "./MaterialImageListClient";
import type { MaterialPageImage } from "@/features/materials-images/lib/schema";

interface AdminMaterialsImagesPageProps {
  params: Promise<{ slug: string }>;
}

export default async function AdminMaterialsImagesPage({
  params,
}: AdminMaterialsImagesPageProps) {
  const user = await getUser();
  const adminUserIds = getAdminUserIds();

  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const { slug } = await params;
  const siteUrl = getSiteUrl();
  const freeMaterialsUrl = siteUrl ? `${siteUrl.replace(/\/$/, "")}/free-materials` : "/free-materials";

  const supabase = createAdminClient();
  const { data: images } = await supabase
    .from("materials_images")
    .select("*")
    .eq("page_slug", slug)
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
          フリー素材管理
        </h1>
        <p className="mt-1 text-slate-600">
          <a
            href={freeMaterialsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-900"
          >
            /free-materials
          </a>
          ページに表示する画像を追加・編集・削除できます。
        </p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <MaterialImageListClient
            slug={slug}
            initialImages={(images ?? []) as MaterialPageImage[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
