import { DoorOpen } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Ga4TopLandingPageRow } from "@/features/analytics/lib/ga4-types";

interface AdminTopLandingPagesCardProps {
  rows: Ga4TopLandingPageRow[];
}

export function AdminTopLandingPagesCard({
  rows,
}: AdminTopLandingPagesCardProps) {
  return (
    <Card className="border-violet-200/60 bg-white/95 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle
          className="text-lg text-slate-900"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          Top Landing Pages
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-600">
          どの入口ページから流入しているかを見て、集客施策やランディングページの強さを確認します。
        </CardDescription>
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
            LP データはまだありません。
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.landingPage}
              className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    landing page
                  </p>
                  <p className="mt-1 break-all text-sm font-semibold text-slate-900">
                    {row.landingPage}
                  </p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <DoorOpen className="h-5 w-5" aria-hidden />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200/70 bg-white/80 p-3">
                <div>
                  <p className="text-xs text-slate-500">セッション</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {row.sessions.toLocaleString("ja-JP")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">アクティブユーザー</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {row.activeUsers.toLocaleString("ja-JP")}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
