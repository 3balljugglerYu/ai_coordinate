import { connection } from "next/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Copy } from "lucide-react";
import { getUser } from "@/lib/auth";
import { getAdminUserIds, getSiteUrl } from "@/lib/env";
import { isUuid } from "@/lib/is-uuid";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPersonalNoticeDetail } from "@/features/personal-notices/lib/repository";
import { formatPersonalNoticeAdminDate } from "@/features/personal-notices/lib/format";
import { PersonalNoticeRecipientsClient } from "@/features/personal-notices/components/PersonalNoticeRecipientsClient";

/**
 * 送った1回分の中身: 相手ごとの受付番号・作品・開いたか・取り消し、CSV
 */
export default async function AdminPersonalNoticeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();
  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const { id } = await params;
  const notice = isUuid(id) ? await getPersonalNoticeDetail(id) : null;
  if (!notice) {
    notFound();
  }

  const openedCount = notice.recipients.filter((r) => !r.retractedAt && r.openedAt).length;
  const retractedCount = notice.recipients.filter((r) => r.retractedAt).length;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="px-0 text-slate-600">
        <Link href="/admin/personal-notices">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          一覧に戻る
        </Link>
      </Button>

      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          {notice.memo}
        </h1>
        <p className="mt-1 text-slate-600">送った1回分の中身です。</p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="text-slate-500">送った日時</dt>
            <dd>{formatPersonalNoticeAdminDate(notice.createdAt)} JST</dd>
            <dt className="text-slate-500">題名</dt>
            <dd>{notice.title}</dd>
            <dt className="text-slate-500">人数</dt>
            <dd>
              {notice.recipientCount}人（開いた {openedCount}人・取り消し {retractedCount}人）
            </dd>
            <dt className="text-slate-500">受付番号</dt>
            <dd>{notice.codePrefix ? `${notice.codePrefix}-○○○○` : "使っていません"}</dd>
          </dl>

          <details className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <summary className="cursor-pointer text-slate-700">送った本文を見る</summary>
            <p className="mt-3 whitespace-pre-line break-words text-slate-800">
              {notice.bodyTemplate}
            </p>
          </details>

          <Button asChild variant="outline">
            <Link href={`/admin/personal-notices/new?from=${notice.id}`}>
              <Copy className="mr-2 h-4 w-4" aria-hidden />
              この文をもとに新しく送る
            </Link>
          </Button>

          <PersonalNoticeRecipientsClient
            noticeId={notice.id}
            memo={notice.memo}
            recipients={notice.recipients}
            siteUrl={getSiteUrl()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
