import Image from "next/image";
import Link from "next/link";
import { Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminImpressionTrendChartPanel } from "./AdminImpressionTrendChartPanel";
import { formatImpressionShare } from "../lib/build-impression-stats";
import type { PostImpressionStats } from "../lib/get-post-impression-stats";

interface AdminImpressionSectionProps {
  stats: PostImpressionStats;
}

const HEADING_FONT = {
  fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
};

function SummaryCell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900" style={HEADING_FONT}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function BreakdownRow({
  label,
  items,
  total,
}: {
  label: string;
  items: Array<{ key: string; label: string; value: number; color: string }>;
  total: number;
}) {
  const visible = items.filter((item) => item.value > 0);
  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <div className="flex flex-wrap gap-2">
        {visible.map((item) => (
          <span
            key={item.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            {item.label}
            <span className="font-semibold text-slate-900">
              {item.value.toLocaleString("ja-JP")}
            </span>
            <span className="text-slate-500">
              {formatImpressionShare(item.value, total)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function AdminImpressionSection({ stats }: AdminImpressionSectionProps) {
  const { totals, daily, topPosts } = stats;

  return (
    <Card className="border-violet-200/60 bg-white/95 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle
              className="flex items-center gap-2 text-lg text-slate-900"
              style={HEADING_FONT}
            >
              <Eye className="h-5 w-5 text-violet-600" aria-hidden />
              インプレッション
            </CardTitle>
            <p className="mt-1 text-sm text-slate-600">
              可視50%×1秒で1件。同じ人・同じ投稿は30分に1回まで数えます。
            </p>
            {/*
              2026-08-12 に重複除外を「1日1回」から「30分に1回」へ変えた。
              書いておかないと、日別チャートの段差をアクセス増と読み違える。
            */}
            <p className="mt-1 text-xs text-slate-500">
              2026-08-12 より前は「1日1回」で集計しています（同じ日を境に数え方が
              変わるため、チャートの段差は増加ではありません）。
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCell
            label="インプレッション"
            value={totals.impressions.toLocaleString("ja-JP")}
          />
          <SummaryCell
            label="ユニーク視聴者"
            value={totals.uniqueViewers.toLocaleString("ja-JP")}
            /*
              「実人数」と書くと過信される。ゲストは IP ハッシュで識別するため、
              モバイルで IP が変わるたびに別人として数えられ、期間が長いほど
              膨らむ。実態に近いのは日別チャートの方。
            */
            hint="日次の合計ではありません。ゲストはIPで識別するため、期間が長いほど多めに出ます"
          />
          <SummaryCell
            label="見られた投稿"
            value={totals.uniquePosts.toLocaleString("ja-JP")}
          />
          <SummaryCell
            label="1投稿あたり平均"
            value={totals.averagePerPost.toLocaleString("ja-JP")}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <BreakdownRow
            label="どこで見られたか"
            total={totals.impressions}
            items={[
              {
                key: "feed",
                label: "フィード",
                value: totals.feed,
                color: "#2563EB",
              },
              {
                key: "grid",
                label: "グリッド",
                value: totals.grid,
                color: "#7C3AED",
              },
              {
                key: "detail",
                label: "投稿詳細",
                value: totals.detail,
                color: "#059669",
              },
              {
                key: "unknown",
                label: "不明(計測前)",
                value: totals.unknown,
                color: "#CBD5E1",
              },
            ]}
          />
          <BreakdownRow
            label="誰が見たか"
            total={totals.impressions}
            items={[
              {
                key: "authenticated",
                label: "ログイン",
                value: totals.authenticated,
                color: "#0F766E",
              },
              {
                key: "guest",
                label: "ゲスト",
                value: totals.guest,
                color: "#D97706",
              },
            ]}
          />
        </div>

        <AdminImpressionTrendChartPanel data={daily} />

        {topPosts.length > 0 ? (
          <div className="space-y-3">
            <div>
              <h3
                className="text-sm font-semibold text-slate-900"
                style={HEADING_FONT}
              >
                よく見られた投稿
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                この期間のインプレッション上位（上段）とユニーク視聴者（下段）。
                タップで投稿詳細へ移動できます。
              </p>
            </div>
            {/*
              表(min-width + 横スクロール)にすると、スマホでは肝心の数値が画面外に
              出てランキングとして機能しない。管理画面はスマホから見ることが多い
              ため、どの幅でも横スクロールなしで数値まで読める並びにする。
            */}
            <ul className="text-sm">
              {topPosts.map((post) => (
                <li
                  key={post.imageId}
                  className="flex items-center gap-3 border-b border-slate-100 py-2 last:border-0"
                >
                  <Link
                    href={`/posts/${post.imageId}`}
                    className="flex min-w-0 flex-1 items-center gap-3 hover:underline"
                    target="_blank"
                  >
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                      {post.thumbUrl ? (
                        <Image
                          src={post.thumbUrl}
                          alt=""
                          fill
                          sizes="40px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : null}
                    </span>
                    <span className="truncate text-slate-700">
                      {post.authorName}
                    </span>
                  </Link>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-slate-900">
                      {post.impressions.toLocaleString("ja-JP")}
                    </p>
                    <p className="text-xs text-slate-500">
                      {post.uniqueViewers.toLocaleString("ja-JP")}人が視聴
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
