import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";

/**
 * 画像最適化監視ダッシュボード
 * 管理者向けの監視ページ
 */
async function getImageOptimizationStats() {
  const supabase = createAdminClient();

  // WebP生成状況を取得（RPCが存在しない場合は、手動で集計）
  let webpStats = null;
  let webpError = null;
  
  try {
    const result = await supabase.rpc("get_webp_generation_stats");
    webpStats = result.data;
    webpError = result.error;
  } catch {
    // RPCが存在しない場合は、手動で集計
    webpStats = null;
    webpError = null;
  }

  // RPCが存在しない場合は、手動で集計
  if (webpError || !webpStats) {
    const { data: allImages } = await supabase
      .from("generated_images")
      .select("id, storage_path_display, storage_path_thumb, storage_path")
      .not("storage_path", "is", null);

    const total = allImages?.length || 0;
    const withWebP = allImages?.filter(
      (img) => img.storage_path_display && img.storage_path_thumb
    ).length || 0;
    const withoutWebP = total - withWebP;

    return {
      total,
      withWebP,
      withoutWebP,
      webpCoverage: total > 0 ? ((withWebP / total) * 100).toFixed(1) : "0",
    };
  }

  return webpStats;
}

/**
 * WebP生成統計情報を表示するコンポーネント
 */
async function WebPStatsCard() {
  const stats = await getImageOptimizationStats();

  return (
    <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
      <div className="p-6 sm:p-8">
        <h2 className="mb-5 text-xl font-bold text-slate-900">WebP生成状況</h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
        <div>
          <div className="text-sm text-slate-600">総画像数</div>
          <div className="text-3xl font-bold tabular-nums text-slate-900">{stats.total}</div>
        </div>
        <div>
          <div className="text-sm text-slate-600">WebP生成済み</div>
          <div className="text-3xl font-bold text-emerald-600 tabular-nums">{stats.withWebP}</div>
        </div>
        <div>
          <div className="text-sm text-slate-600">WebP未生成</div>
          <div className="text-3xl font-bold text-amber-600 tabular-nums">{stats.withoutWebP}</div>
        </div>
        <div>
          <div className="text-sm text-slate-600">カバレッジ</div>
          <div className="text-3xl font-bold tabular-nums text-slate-900">{stats.webpCoverage}%</div>
        </div>
      </div>
      </div>
    </Card>
  );
}

/**
 * Vercel Analyticsへのリンクを表示するコンポーネント
 */
function VercelAnalyticsCard() {
  return (
    <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
      <div className="p-6 sm:p-8">
        <h2 className="mb-5 text-xl font-bold text-slate-900">Vercel Analytics</h2>
        <div className="space-y-4">
          <p className="text-slate-600">
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">/_next/image</code>
            エンドポイントのリクエスト数を監視するには、Vercelダッシュボードで確認してください。
          </p>
        <div className="space-y-2">
          <h3 className="font-semibold text-slate-900">確認方法:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-slate-600">
            <li>Vercelダッシュボードにログイン</li>
            <li>プロジェクトを選択</li>
            <li>「Analytics」タブを開く</li>
            <li>「Web Vitals」または「Events」で <code className="rounded bg-slate-100 px-1 text-xs">/_next/image</code> を検索</li>
            <li>リクエスト数とパフォーマンスメトリクスを確認</li>
          </ol>
        </div>
        <div className="pt-4 border-t">
          <h3 className="font-semibold mb-2 text-slate-900">監視ポイント:</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-slate-600">
            <li><code className="rounded bg-slate-100 px-1 text-xs">/_next/image</code> へのリクエスト数が減少していること</li>
            <li>一覧画面では unoptimized プロパティによりリクエストが0になっていること</li>
            <li>詳細画面では必要に応じて最適化が適用されていること</li>
            <li>WebP画像が正しく配信されていること</li>
          </ul>
        </div>
      </div>
      </div>
    </Card>
  );
}

/**
 * バッチ処理実行のリンクを表示するコンポーネント
 */
function BatchProcessingCard() {
  return (
    <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
      <div className="p-6 sm:p-8">
        <h2 className="mb-5 text-xl font-bold text-slate-900">バッチ処理</h2>
        <div className="space-y-4">
        <p className="text-slate-600">
          既存画像のWebP生成バッチ処理を実行できます。
        </p>
        <div className="space-y-2">
          <h3 className="font-semibold text-slate-900">API エンドポイント:</h3>
          <code className="block rounded-lg bg-slate-100 p-3 text-sm">
            POST /api/admin/generate-webp?limit=10&amp;offset=0
          </code>
          <code className="block rounded-lg bg-slate-100 p-3 text-sm">
            GET /api/admin/generate-webp （処理対象数を取得）
          </code>
        </div>
        <div className="pt-4 border-t border-slate-200">
          <p className="text-sm text-slate-600">
            詳細は、<code className="bg-slate-100 px-1 rounded text-slate-800">app/api/admin/generate-webp/route.ts</code>を参照してください。
          </p>
        </div>
      </div>
      </div>
    </Card>
  );
}

/**
 * 画像最適化監視ダッシュボードページ
 */
export default async function ImageOptimizationDashboard() {
  const user = await getUser();
  const adminUserIds = getAdminUserIds();

  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{ fontFamily: "var(--font-admin-heading), ui-monospace, monospace" }}
        >
          画像最適化監視ダッシュボード
        </h1>
        <p className="mt-1 text-slate-600">
          Vercel Image Optimizationの負荷を監視し、WebP生成状況を確認します。
        </p>
      </header>

      <div className="space-y-6">
        <Suspense
          fallback={
            <Card className="border-violet-200/60 bg-white/95 p-6">
              <div className="flex items-center gap-2 text-slate-500">
                読み込み中...
              </div>
            </Card>
          }
        >
          <WebPStatsCard />
        </Suspense>
        <VercelAnalyticsCard />
        <BatchProcessingCard />
      </div>
    </div>
  );
}
