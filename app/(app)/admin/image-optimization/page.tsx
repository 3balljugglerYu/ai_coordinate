import { Suspense } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { WebPStatsCardSkeleton } from "./WebPStatsCardSkeleton";
import { requireAuth } from "@/lib/auth";

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
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">WebP生成状況</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <div className="text-sm text-muted-foreground">総画像数</div>
          <div className="text-3xl font-bold">{stats.total}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">WebP生成済み</div>
          <div className="text-3xl font-bold text-green-600">{stats.withWebP}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">WebP未生成</div>
          <div className="text-3xl font-bold text-orange-600">{stats.withoutWebP}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">カバレッジ</div>
          <div className="text-3xl font-bold">{stats.webpCoverage}%</div>
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
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">Vercel Analytics</h2>
      <div className="space-y-4">
        <p className="text-muted-foreground">
          `/_next/image`エンドポイントのリクエスト数を監視するには、Vercelダッシュボードで確認してください。
        </p>
        <div className="space-y-2">
          <h3 className="font-semibold">確認方法:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>Vercelダッシュボードにログイン</li>
            <li>プロジェクトを選択</li>
            <li>「Analytics」タブを開く</li>
            <li>「Web Vitals」または「Events」で`/_next/image`を検索</li>
            <li>リクエスト数とパフォーマンスメトリクスを確認</li>
          </ol>
        </div>
        <div className="pt-4 border-t">
          <h3 className="font-semibold mb-2">監視ポイント:</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            <li>`/_next/image`へのリクエスト数が減少していること</li>
            <li>一覧画面では`unoptimized`プロパティにより`/_next/image`リクエストが0になっていること</li>
            <li>詳細画面では必要に応じて最適化が適用されていること</li>
            <li>WebP画像が正しく配信されていること</li>
          </ul>
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
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">バッチ処理</h2>
      <div className="space-y-4">
        <p className="text-muted-foreground">
          既存画像のWebP生成バッチ処理を実行できます。
        </p>
        <div className="space-y-2">
          <h3 className="font-semibold">API エンドポイント:</h3>
          <code className="block p-2 bg-muted rounded text-sm">
            POST /api/admin/generate-webp?limit=10&offset=0
          </code>
          <code className="block p-2 bg-muted rounded text-sm">
            GET /api/admin/generate-webp (処理対象数を取得)
          </code>
        </div>
        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            詳細は、<code className="bg-muted px-1 rounded">app/api/admin/generate-webp/route.ts</code>を参照してください。
          </p>
        </div>
      </div>
    </Card>
  );
}

/**
 * 画像最適化監視ダッシュボードページ
 */
export default async function ImageOptimizationDashboard() {
  // 認証が必要なページ
  await requireAuth();
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">画像最適化監視ダッシュボード</h1>
        <p className="text-muted-foreground">
          Vercel Image Optimizationの負荷を監視し、WebP生成状況を確認します。
        </p>
      </div>

      <div className="space-y-6">
        <Suspense fallback={<WebPStatsCardSkeleton />}>
          <WebPStatsCard />
        </Suspense>
        <VercelAnalyticsCard />
        <BatchProcessingCard />
      </div>
    </div>
  );
}
