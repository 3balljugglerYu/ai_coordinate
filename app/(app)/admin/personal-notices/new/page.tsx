import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { isUuid } from "@/lib/is-uuid";
import { Card, CardContent } from "@/components/ui/card";
import { getPersonalNoticeDetail } from "@/features/personal-notices/lib/repository";
import { PersonalNoticeSendClient } from "@/features/personal-notices/components/PersonalNoticeSendClient";

/**
 * 個人あてのお知らせを送る。?from=<送った回のid> なら題名・本文・頭の英字を写す
 */
export default async function AdminPersonalNoticeNewPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();
  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const { from } = await searchParams;
  const source =
    typeof from === "string" && isUuid(from)
      ? await getPersonalNoticeDetail(from)
      : null;

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          個人あてのお知らせを送る
        </h1>
        <p className="mt-1 text-slate-600">
          ① 宛先を貼って確かめる → ② 文を書いて送る。賞ごとに1回ずつ送ります。
        </p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <PersonalNoticeSendClient
            copiedFromMemo={source?.memo ?? null}
            defaults={{
              memo: "",
              title: source?.title ?? "",
              body: source?.bodyTemplate ?? "",
              codePrefix: source?.codePrefix ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
