import { connection } from "next/server";
import { Card, CardContent } from "@/components/ui/card";
import { ensureAdminPage } from "@/lib/admin-page-guard";
import { listI2iAllowlist } from "@/features/catalog-references/lib/i2i-allowlist-repository";
import { AllowlistManagerClient } from "../_components/AllowlistManagerClient";

/**
 * 見本(参照画像)つきのカタログを作れる人を、運営が選ぶ。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md Phase 2
 */
export default async function AdminI2iAllowlistPage() {
  await connection();
  await ensureAdminPage();

  const members = await listI2iAllowlist();

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          見本を使える人
        </h1>
        <p className="mt-1 text-slate-600">
          「カタログをつくる」で見本(参照画像)を使える人を選びます。だれも登録されていなければ、
          だれも使えません。いまは準備中で、利用者の画面に見本の欄はまだ出ません(出るようにするのは
          このあとの段階です)。出るようになると、ここで有効になっている人にだけ見本の欄が出て、
          見本を使って作ったカタログは運営の確認のあとで投稿できるようになります。
        </p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <AllowlistManagerClient
            initialMembers={members}
            apiPath="/api/admin/i2i-allowlist"
            copy={{
              addHeading: "使える人を追加",
              addButton: "追加",
              addedDescription: "見本を使える人に追加しました",
              listHeading: "見本を使える人",
              removeConfirm: "この人を一覧から削除しますか?(履歴は残りません)",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
