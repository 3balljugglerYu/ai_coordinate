import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { listStylePresetsForAdmin } from "@/features/style-presets/lib/style-preset-repository";
import { StylePresetListClient } from "./StylePresetListClient";

export default async function AdminStylePresetsPage() {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();

  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const presets = await listStylePresetsForAdmin();

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

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <StylePresetListClient initialPresets={presets} />
        </CardContent>
      </Card>
    </div>
  );
}
