import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Ga4TopPageRow } from "@/features/analytics/lib/ga4-types";

interface AdminTopPagesCardProps {
  rows: Ga4TopPageRow[];
}

export function AdminTopPagesCard({ rows }: AdminTopPagesCardProps) {
  return (
    <Card className="border-violet-200/60 bg-white/95 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle
          className="text-lg text-slate-900"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          Top Pages
        </CardTitle>
      </CardHeader>
      <CardContent
        className="space-y-3"
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: "0 320px",
        }}
      >
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm text-slate-500">
            ページ別データはまだありません。
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={`${row.path}-${row.title ?? "untitled"}`}
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
                  <BarChart3 className="h-5 w-5" aria-hidden />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200/70 bg-white/80 p-3">
                <div>
                  <p className="text-xs text-slate-500">ページビュー</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {row.views.toLocaleString("ja-JP")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">アクティブユーザー</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {row.activeUsers.toLocaleString("ja-JP")}
                  </p>
                </div>
              </div>

              {row.path.startsWith("/") ? (
                <div className="mt-3">
                  <Link
                    href={row.path}
                    className="text-xs font-medium text-violet-700 hover:text-violet-800 hover:underline"
                  >
                    ページを開く
                  </Link>
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
