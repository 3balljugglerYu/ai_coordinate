import Link from "next/link";
import { Eye, Info } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Ga4WatchlistData } from "@/features/analytics/lib/get-ga4-watchlist-pages";

/**
 * 追いかけたいページの数字を、順位に関係なく並べるカード。
 *
 * Top Pages は上位8件だけなので、新設ページはまず入らない。
 * 施策のページがどうなったかを見るには、名指しで出す必要がある。
 */
export function AdminWatchlistPagesCard({ data }: { data: Ga4WatchlistData }) {
  return (
    <Card className="border-violet-200/60 bg-white/95 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle
          className="text-lg text-slate-900"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          注目ページ
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-600">
          追いかけたいページの数字を、順位に関係なく表示します。上位に入らない新設ページもここで確認できます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.status !== "ready" ? (
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Info className="h-5 w-5" aria-hidden />
            </div>
            <p className="text-sm leading-6 text-slate-600">
              {data.statusMessage ?? "GA4 データを取得できませんでした。"}
            </p>
          </div>
        ) : (
          data.rows.map((row) => (
            <div
              key={row.path}
              className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {row.title ?? row.path}
                  </p>
                  <p className="mt-1 break-all text-xs leading-5 text-slate-500">
                    {row.path}
                  </p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                  <Eye className="h-5 w-5" aria-hidden />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200/70 bg-white/80 p-3">
                <div>
                  <p className="text-xs text-slate-500">ページビュー</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 tabular-nums">
                    {row.views.toLocaleString("ja-JP")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">アクティブユーザー</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 tabular-nums">
                    {row.activeUsers.toLocaleString("ja-JP")}
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <Link
                  href={row.path}
                  className="text-xs font-medium text-violet-700 hover:text-violet-800 hover:underline"
                >
                  ページを開く
                </Link>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
