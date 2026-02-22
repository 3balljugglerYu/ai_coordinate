import { Suspense } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Coins,
  ImageIcon,
  Search,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

async function getModerationQueueCount() {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("generated_images")
    .select("id", { count: "exact", head: true })
    .eq("is_posted", true)
    .eq("moderation_status", "pending");

  if (error) return 0;
  return count ?? 0;
}

async function getImageOptimizationStats() {
  const supabase = createAdminClient();
  let webpStats = null;
  let webpError = null;

  try {
    const result = await supabase.rpc("get_webp_generation_stats");
    webpStats = result.data;
    webpError = result.error;
  } catch {
    webpStats = null;
    webpError = null;
  }

  if (webpError || !webpStats) {
    const { data: allImages } = await supabase
      .from("generated_images")
      .select("id, storage_path_display, storage_path_thumb, storage_path")
      .not("storage_path", "is", null);

    const total = allImages?.length || 0;
    const withWebP =
      allImages?.filter(
        (img) => img.storage_path_display && img.storage_path_thumb
      ).length || 0;
    const withoutWebP = total - withWebP;
    const webpCoverage =
      total > 0 ? ((withWebP / total) * 100).toFixed(1) : "0";

    return { total, withWebP, withoutWebP, webpCoverage };
  }

  return webpStats;
}

async function ModerationStatCard() {
  const count = await getModerationQueueCount();
  const hasPending = count > 0;

  return (
    <Link
      href="/admin/moderation"
      className={cn(
        "block rounded-xl border bg-white/95 shadow-sm transition-all duration-200",
        "hover:shadow-md hover:border-violet-300/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
        hasPending
          ? "border-amber-200/80 bg-amber-50/30"
          : "border-violet-200/60"
      )}
      aria-label={`投稿審査へ移動（待機中: ${count}件）`}
    >
      <Card className="border-0 shadow-none bg-transparent">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors duration-200",
                  hasPending ? "bg-amber-100 text-amber-600" : "bg-violet-100 text-violet-600"
                )}
              >
                <ShieldCheck className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600">
                  投稿審査キュー
                </p>
                <p
                  className={cn(
                    "text-2xl font-bold tabular-nums",
                    hasPending ? "text-amber-700" : "text-slate-900"
                  )}
                  style={{ fontFamily: "var(--font-admin-heading), ui-monospace, monospace" }}
                >
                  {count}
                  <span className="ml-1 text-sm font-normal text-slate-500">
                    件
                  </span>
                </p>
              </div>
            </div>
            <ArrowRight
              className="h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 group-hover:translate-x-1"
              aria-hidden
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

async function ImageOptimizationStatCard() {
  const stats = await getImageOptimizationStats();

  return (
    <Link
      href="/admin/image-optimization"
      className={cn(
        "block rounded-xl border border-violet-200/60 bg-white/95 shadow-sm transition-all duration-200",
        "hover:shadow-md hover:border-violet-300/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      )}
      aria-label="画像最適化へ移動"
    >
      <Card className="border-0 shadow-none bg-transparent">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                <ImageIcon className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600">
                  WebPカバレッジ
                </p>
                <p
                  className="text-2xl font-bold tabular-nums text-slate-900"
                  style={{ fontFamily: "var(--font-admin-heading), ui-monospace, monospace" }}
                >
                  {stats.webpCoverage}%
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {stats.withWebP} / {stats.total} 画像
                </p>
              </div>
            </div>
            <ArrowRight
              className="h-5 w-5 shrink-0 text-slate-400"
              aria-hidden
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function UserSearchQuickLink() {
  return (
    <Link
      href="/admin/users"
      className={cn(
        "block rounded-xl border border-violet-200/60 bg-white/95 shadow-sm transition-all duration-200",
        "hover:shadow-md hover:border-violet-300/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      )}
      aria-label="ユーザー検索へ移動"
    >
      <Card className="border-0 shadow-none bg-transparent">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                <Search className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600">
                  ユーザー検索
                </p>
                <p className="text-sm text-slate-500">
                  ID・ニックネームで検索
                </p>
              </div>
            </div>
            <ArrowRight
              className="h-5 w-5 shrink-0 text-slate-400"
              aria-hidden
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function BonusQuickLink() {
  return (
    <Link
      href="/admin/bonus"
      className={cn(
        "block rounded-xl border border-violet-200/60 bg-white/95 shadow-sm transition-all duration-200",
        "hover:shadow-md hover:border-violet-300/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      )}
      aria-label="ボーナス付与へ移動"
    >
      <Card className="border-0 shadow-none bg-transparent">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                <Coins className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600">
                  ボーナス付与
                </p>
                <p className="text-sm text-slate-500">
                  ペルコインを手動で付与
                </p>
              </div>
            </div>
            <ArrowRight
              className="h-5 w-5 shrink-0 text-slate-400"
              aria-hidden
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{ fontFamily: "var(--font-admin-heading), ui-monospace, monospace" }}
        >
          管理ダッシュボード
        </h1>
        <p className="mt-1 text-slate-600 font-[family-name:var(--font-admin-body)]">
          運営タスクの概要とクイックアクセス
        </p>
      </header>

      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="sr-only">
          KPIとクイックリンク
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Suspense
            fallback={
              <Card className="overflow-hidden border-violet-200/60 bg-white/95">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 text-slate-500">
                    <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                    <span>読み込み中...</span>
                  </div>
                </CardContent>
              </Card>
            }
          >
            <ModerationStatCard />
          </Suspense>
          <Suspense
            fallback={
              <Card className="overflow-hidden border-violet-200/60 bg-white/95">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 text-slate-500">
                    <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                    <span>読み込み中...</span>
                  </div>
                </CardContent>
              </Card>
            }
          >
            <ImageOptimizationStatCard />
          </Suspense>
          <UserSearchQuickLink />
          <BonusQuickLink />
        </div>
      </section>
    </div>
  );
}
