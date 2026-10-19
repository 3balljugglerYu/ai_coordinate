import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listPersonalNotices } from "@/features/personal-notices/lib/repository";
import { formatPersonalNoticeAdminDate } from "@/features/personal-notices/lib/format";

/**
 * 個人あてのお知らせ: 送った記録の一覧(新しい順・メモで探す)
 */
export default async function AdminPersonalNoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();
  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 100) : "";
  const notices = await listPersonalNotices(query);

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          個人あてのお知らせ
        </h1>
        <p className="mt-1 text-slate-600">
          選んだ人だけに「あなたへの通知」でお知らせを送ります。送った記録の一覧です（新しい順に100件まで）。
        </p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="space-y-4 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <form action="/admin/personal-notices" className="flex gap-2">
              <Input
                name="q"
                defaultValue={query}
                placeholder="メモで探す"
                className="max-w-xs"
                aria-label="メモで探す"
              />
              <Button type="submit" variant="outline">
                探す
              </Button>
            </form>
            <Button asChild className="ml-auto">
              <Link href="/admin/personal-notices/new">
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                新しく送る
              </Link>
            </Button>
          </div>

          {notices.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              {query ? "当てはまる記録がありません" : "まだ送っていません"}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left font-medium">送った日時</th>
                    <th className="px-4 py-3 text-left font-medium">メモ</th>
                    <th className="px-4 py-3 text-left font-medium">題名</th>
                    <th className="px-4 py-3 text-left font-medium">人数</th>
                    <th className="px-4 py-3 text-left font-medium">開いた</th>
                  </tr>
                </thead>
                <tbody>
                  {notices.map((notice) => (
                    <tr key={notice.id} className="border-b border-slate-100 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2">
                        {formatPersonalNoticeAdminDate(notice.createdAt)}
                      </td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/admin/personal-notices/${notice.id}`}
                          className="text-violet-700 underline underline-offset-2 hover:text-violet-900"
                        >
                          {notice.memo}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{notice.title}</td>
                      <td className="whitespace-nowrap px-4 py-2">
                        {notice.recipientCount}人
                        {notice.retractedCount > 0 && (
                          <span className="text-slate-500">（取り消し {notice.retractedCount}人）</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">{notice.openedCount}人</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
