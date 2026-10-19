"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { escapeCsvCell } from "@/lib/csv/escape-csv-cell";
import type { PersonalNoticeRecipientView } from "../lib/repository";
import { formatPersonalNoticeAdminDate } from "../lib/format";
import { AttachedPostThumb, RecipientIdentity } from "./RecipientCells";

interface PersonalNoticeRecipientsClientProps {
  noticeId: string;
  memo: string;
  recipients: PersonalNoticeRecipientView[];
  siteUrl: string;
}

/** 受付番号の照合用 CSV(数式として動く値は無害化する・PN-017) */
export function buildPersonalNoticeRecipientsCsv(
  recipients: PersonalNoticeRecipientView[],
  siteUrl: string
): string {
  const header = [
    "nickname",
    "user_id",
    "receipt_code",
    "post_url",
    "opened_at",
    "retracted_at",
  ].join(",");
  const lines = recipients.map((r) =>
    [
      escapeCsvCell(r.nickname),
      escapeCsvCell(r.recipientId),
      escapeCsvCell(r.receiptCode),
      escapeCsvCell(r.postId ? `${siteUrl}/posts/${r.postId}` : ""),
      escapeCsvCell(r.openedAt ? `${formatPersonalNoticeAdminDate(r.openedAt)} JST` : ""),
      escapeCsvCell(r.retractedAt ? `${formatPersonalNoticeAdminDate(r.retractedAt)} JST` : ""),
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

/**
 * 送った1回分の相手の一覧。1人ずつ取り消し(相手の通知から消え、記録は残る)と CSV。
 */
export function PersonalNoticeRecipientsClient({
  noticeId,
  memo,
  recipients,
  siteUrl,
}: PersonalNoticeRecipientsClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [retractTarget, setRetractTarget] =
    useState<PersonalNoticeRecipientView | null>(null);
  const [isRetracting, setIsRetracting] = useState(false);

  function handleDownloadCsv() {
    const csv = buildPersonalNoticeRecipientsCsv(recipients, siteUrl);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `personal_notice_${noticeId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleRetract() {
    if (!retractTarget) return;
    setIsRetracting(true);
    try {
      const res = await fetch(
        `/api/admin/personal-notices/recipients/${retractTarget.id}/retract`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "取り消しに失敗しました");
      }
      toast({
        title: "取り消しました",
        description: `${retractTarget.nickname ?? "相手"}さんの通知から消しました`,
      });
      setRetractTarget(null);
      router.refresh();
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "取り消しに失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsRetracting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button type="button" variant="outline" onClick={handleDownloadCsv}>
        <Download className="mr-2 h-4 w-4" aria-hidden />
        CSVをダウンロード
      </Button>

      <div className="relative overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left font-medium">宛先</th>
              <th className="px-4 py-3 text-left font-medium">受付番号</th>
              <th className="px-4 py-3 text-left font-medium">作品</th>
              <th className="px-4 py-3 text-left font-medium">開いた</th>
              <th className="px-4 py-3 text-left font-medium">
                <span className="sr-only">取り消し</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((r) => (
              <tr
                key={r.id}
                className={`border-b border-slate-100 last:border-0 ${r.retractedAt ? "text-slate-400" : ""}`}
              >
                <td className="px-4 py-2">
                  <a
                    href={`/admin/users/${r.recipientId}`}
                    className="hover:underline"
                  >
                    <RecipientIdentity nickname={r.nickname} avatarUrl={r.avatarUrl} />
                  </a>
                </td>
                <td className="px-4 py-2 font-mono">{r.receiptCode ?? "-"}</td>
                <td className="px-4 py-2">
                  <AttachedPostThumb postId={r.postId} thumbUrl={r.postThumbUrl} />
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  {r.retractedAt
                    ? "-"
                    : r.openedAt
                      ? formatPersonalNoticeAdminDate(r.openedAt)
                      : "まだ"}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  {r.retractedAt ? (
                    `取り消し済み（${formatPersonalNoticeAdminDate(r.retractedAt)}）`
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRetractTarget(r)}
                    >
                      取り消す
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog
        open={!!retractTarget}
        onOpenChange={(open) => !open && !isRetracting && setRetractTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {retractTarget?.nickname ?? "この人"}さんへのお知らせを取り消しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              「{memo}」のお知らせが、相手の通知から消えます。こちらの記録と受付番号は残ります。元には戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRetracting}>やめる</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleRetract();
              }}
              disabled={isRetracting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              取り消す
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
