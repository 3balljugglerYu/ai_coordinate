import { BellRing, CircleAlert, CircleCheck, Clock3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getModerationOutboxHealth,
  getOutboxSeverity,
} from "../lib/get-moderation-outbox-health";

/**
 * モデレーション通知の配送状況カード（管理ダッシュボード）
 *
 * 公開停止の通知は outbox に記録してから配送するため、dispatcher が止まると
 * 伝票が溜まり、投稿者が「投稿が止められたこと」を知らないまま放置される。
 * 通知が未配送の間は異議申立ての期限が開始しないので投稿者は不利益を被らないが、
 * 気づく手段がないと放置が長期化する。
 *
 * SQL を定期実行する運用は続かないため、管理画面を開いたときに自然に目に入る
 * 位置に置く。データは自前で取得する（ダッシュボードの data パイプラインを
 * 通さないことで、本体と独立して追加・撤去できる）。
 */
export async function AdminModerationOutboxCard() {
  const health = await getModerationOutboxHealth();
  const severity = getOutboxSeverity(health);

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleString("ja-JP") : "-";

  // 経過時間は取得層で確定済みの値を使う。レンダー中に Date.now() を
  // 呼ぶと React の純粋性ルールに反する。
  const elapsedLabel = (() => {
    const ms = health.oldestPendingAgeMs;
    if (ms === null) return null;
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}分`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}時間`;
    return `${Math.floor(hours / 24)}日`;
  })();

  const tone =
    severity === "stuck"
      ? {
          card: "border-rose-300 bg-rose-50/70",
          badge: "bg-rose-100 text-rose-800",
          icon: CircleAlert,
          label: "配送が滞っています",
        }
      : severity === "watch"
        ? {
            card: "border-amber-200 bg-amber-50/60",
            badge: "bg-amber-100 text-amber-800",
            icon: Clock3,
            label: "再試行中",
          }
        : {
            card: "border-emerald-200/70 bg-white/95",
            badge: "bg-emerald-100 text-emerald-800",
            icon: CircleCheck,
            label: "正常",
          };

  const ToneIcon = tone.icon;

  return (
    <Card className={`shadow-sm ${tone.card}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-4 w-4 text-slate-500" />
          モデレーション通知の配送状況
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {health.unavailable ? (
          <p className="text-sm text-slate-600">
            配送状況を取得できませんでした。時間をおいて再読み込みしてください。
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tone.badge}`}
              >
                <ToneIcon className="h-3.5 w-3.5" />
                {tone.label}
              </span>
              <span className="text-sm text-slate-700">
                未配送 <strong className="text-base">{health.pendingCount}</strong> 件
              </span>
            </div>

            {health.pendingCount > 0 ? (
              <dl className="space-y-1 text-xs text-slate-600">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0">最古の滞留</dt>
                  <dd>
                    {formatDate(health.oldestPendingAt)}
                    {elapsedLabel ? `（${elapsedLabel}経過）` : ""}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0">最大試行回数</dt>
                  <dd>{health.maxAttemptCount} 回</dd>
                </div>
                {health.lastError && (
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0">直近のエラー</dt>
                    <dd className="break-all">{health.lastError}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-xs text-slate-600">
                配送済み {health.deliveredCount.toLocaleString("ja-JP")} 件。
                未配送はありません。
              </p>
            )}

            {severity === "stuck" && (
              <div className="rounded-md border border-rose-200 bg-white/80 p-3 text-xs text-rose-900">
                <p className="font-semibold">対応方法</p>
                <p className="mt-1">
                  通知が投稿者に届いていません。原因を確認したうえで、SQL エディタで
                  下記を実行すると溜まった分を配送できます。通知が未配送の間は
                  異議申立ての期限が開始しないため、投稿者の申立て期間は失われません。
                </p>
                <code className="mt-2 block rounded bg-rose-100/70 px-2 py-1 font-mono">
                  select dispatch_moderation_notification_outbox(50);
                </code>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
