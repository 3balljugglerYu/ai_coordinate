import { Suspense } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PercoinBalance } from "../lib/build-percoin-balance";
import type { RevenueTree, RevenueTreePeriod } from "../lib/build-revenue-tree";
import type { WeeklyAnswer } from "../lib/build-weekly-answer";
import type { GrowthOverviewResult } from "../lib/get-growth-overview";
import { formatCount as num, formatDiff as diff, formatPct as pct } from "../lib/growth-format";
import { LOW_RUNWAY_LIST_LIMIT, LOW_RUNWAY_MAX_DAYS } from "../lib/growth-overview-types";
import { AdminPercoinDailyFlowChartPanel } from "./AdminPercoinDailyFlowChartPanel";

const HEADING_STYLE = {
  fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
};

function SectionTitle({ index, title, question }: { index: number; title: string; question: string }) {
  return (
    <CardTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-lg text-slate-900" style={HEADING_STYLE}>
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
        {index}
      </span>
      {title}
      <span className="text-xs font-medium text-slate-500">{question}</span>
    </CardTitle>
  );
}

function WeeklyAnswerCard({ answer }: { answer: WeeklyAnswer }) {
  const key = answer.finding.kind !== "insufficient_sample" && answer.finding.kind !== "no_bottleneck";
  return (
    <Card className="border-violet-200/60 bg-white/95 shadow-sm">
      <CardHeader className="pb-3">
        <SectionTitle index={1} title="今週の答え" question="今、何をすればよい?" />
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-[1fr_1.3fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-xs font-bold text-slate-500">売上</p>
          <p className="mt-1 text-base font-bold text-slate-900">{answer.revenue.headline}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{answer.revenue.detail}</p>
        </div>
        <div
          className={
            key
              ? "rounded-xl border-2 border-orange-500 bg-orange-50/60 p-4"
              : "rounded-xl border border-slate-200 bg-slate-50/70 p-4"
          }
        >
          <p className={key ? "text-xs font-bold text-orange-700" : "text-xs font-bold text-slate-500"}>
            一番効く直し所
          </p>
          <p className="mt-1 text-base font-bold text-slate-900">{answer.finding.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{answer.finding.detail}</p>
          <p className="mt-3 text-xs font-bold text-slate-700">効いたかを見る数字</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
            {answer.finding.watch.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-xs font-bold text-slate-500">そのほか</p>
          {answer.notes.length === 0 ? (
            <p className="mt-1 text-xs text-slate-600">前の期間とも比べています。</p>
          ) : (
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-600">
              {answer.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            配り方や値段の変え方は、ここでは出しません。変えた日は「出来事の印」に入れると、グラフで前後を比べられます。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function TreeNode({
  label,
  value,
  sub,
  emphasis,
  root,
}: {
  label: string;
  value: string;
  sub: string;
  emphasis?: boolean;
  root?: boolean;
}) {
  const className = root
    ? "rounded-xl bg-violet-600 p-3 text-white"
    : emphasis
      ? "rounded-xl border-2 border-orange-500 bg-orange-50/60 p-3"
      : "rounded-xl border border-violet-200 bg-violet-50/50 p-3";
  return (
    <div className={className}>
      <p className={root ? "text-xs font-bold text-violet-100" : "text-xs font-bold text-slate-500"}>{label}</p>
      <p className="text-2xl font-bold" style={HEADING_STYLE}>
        {value}
      </p>
      <p className={root ? "text-xs text-violet-100" : "text-xs text-slate-600"}>{sub}</p>
    </div>
  );
}

function RevenueTreeCard({
  tree,
  stuck,
}: {
  tree: RevenueTree;
  stuck: "payer_rate" | "active_users" | null;
}) {
  const { current: c, previous: p } = tree;
  const branchLine = (label: string, b: RevenueTreePeriod["newUsers"]) => (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-700">
      <span className="font-bold">{label}</span> 使っている {num(b.activeUsers)}人 → 課金 {num(b.payers)}人
      ({pct(b.payerRatePct)}) → {num(b.revenueYen)}円
    </div>
  );
  return (
    <Card className="border-violet-200/60 bg-white/95 shadow-sm">
      <CardHeader className="pb-3">
        <SectionTitle index={2} title="売上のツリー" question="売上はどこから来て、何が足りない?" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
          <TreeNode root label="売上" value={`${num(c.revenueYen)}円`} sub={`前 ${num(p.revenueYen)}円(${diff(c.revenueYen, p.revenueYen, "円")})`} />
          <span className="hidden text-center text-xl font-bold text-slate-400 sm:block">=</span>
          <TreeNode
            emphasis={stuck === "active_users"}
            label="使っている人"
            value={`${num(c.activeUsers)}人`}
            sub={`前 ${num(p.activeUsers)}人(${diff(c.activeUsers, p.activeUsers, "人")})`}
          />
          <span className="hidden text-center text-xl font-bold text-slate-400 sm:block">×</span>
          <TreeNode
            emphasis={stuck === "payer_rate"}
            label="課金した人の割合"
            value={pct(c.payerRatePct)}
            sub={`${num(c.payers)}人 / 前 ${pct(p.payerRatePct)}(${num(p.payers)}人)`}
          />
          <span className="hidden text-center text-xl font-bold text-slate-400 sm:block">×</span>
          <TreeNode
            label="課金した人1人あたり"
            value={c.revenuePerPayerYen === null ? "—" : `${num(c.revenuePerPayerYen)}円`}
            sub={`前 ${p.revenuePerPayerYen === null ? "—" : `${num(p.revenuePerPayerYen)}円`}`}
          />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {branchLine("新しく登録した人(期間内)", c.newUsers)}
          {branchLine("前から使っている人", c.existingUsers)}
        </div>
        <p className="text-xs text-slate-500">
          使っている人 = 期間内に生成に成功した人か、お金を払った人(サブスクの更新も含む)。課金した人は必ずこの中に入ります。
        </p>
      </CardContent>
    </Card>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 1.5 : 0) : 0;
  return (
    <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100">
      <div className="h-full rounded" style={{ width: `${width}%`, backgroundColor: color }} />
    </div>
  );
}

function PercoinBalanceCard({ balance }: { balance: PercoinBalance }) {
  const { current: c, previous: p } = balance;
  const max = Math.max(c.freeGranted, c.netConsumed, c.purchased, 1);
  const runwayMax = Math.max(...balance.runway.map((r) => r.users), 1);
  const usageMax = Math.max(...balance.usageByKind.map((u) => u.amount), 1);
  return (
    <Card className="border-violet-200/60 bg-white/95 shadow-sm">
      <CardHeader className="pb-3">
        <SectionTitle index={3} title="ペルコインの釣り合い" question="買う理由があるか?" />
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-bold text-slate-800">配った量と使った量</p>
            {[
              { label: "配った(無料)", value: c.freeGranted, prev: p.freeGranted, color: "#8B5CF6" },
              { label: "使った(正味)", value: c.netConsumed, prev: p.netConsumed, color: "#F97316" },
              { label: "買った(本番の支払い)", value: c.purchased, prev: p.purchased, color: "#16A34A" },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-slate-700 sm:w-36">{row.label}</span>
                <Bar value={row.value} max={max} color={row.color} />
                <span className="w-20 shrink-0 text-right tabular-nums sm:w-28">
                  <span className="font-bold">{num(row.value)}</span>
                  <span className="block text-xs text-slate-500">前 {num(row.prev)}</span>
                </span>
              </div>
            ))}
            <p className="text-xs text-slate-600">
              配った ÷ 使った = <span className="font-bold">{balance.freeToNetRatio ?? "—"}</span>
              (前 {balance.previousFreeToNetRatio ?? "—"})。1 以上なら、配る方が多い。失敗の返金 {num(c.refunded)}
              は使った量から引いています。使った量のうち有料のペルコインは {num(balance.paidNetConsumed)}。
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-bold text-slate-800">配った元</p>
            {balance.freeBySource.length === 0 ? (
              <p className="text-xs text-slate-500">この期間の配布はありません。</p>
            ) : (
              balance.freeBySource.map((item) => (
                <div key={item.key} className="flex items-center gap-3 text-xs">
                  <span className="w-28 shrink-0 truncate text-slate-700 sm:w-44" title={item.label}>{item.label}</span>
                  <Bar value={item.amount} max={balance.freeBySource[0].amount} color="#A78BFA" />
                  <span className="w-20 shrink-0 text-right tabular-nums sm:w-24">
                    {num(item.amount)}
                    <span className="text-slate-500">({num(item.users ?? 0)}人)</span>
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-bold text-slate-800">使い道(正味)</p>
            {balance.usageByKind.length === 0 ? (
              <p className="text-xs text-slate-500">この期間の消費はありません。</p>
            ) : (
              balance.usageByKind.map((item) => (
                <div key={item.key} className="flex items-center gap-3 text-xs">
                  <span className="w-28 shrink-0 truncate text-slate-700 sm:w-44" title={item.label}>{item.label}</span>
                  <Bar value={Math.max(item.amount, 0)} max={usageMax} color="#FDBA74" />
                  <span className="w-20 shrink-0 text-right tabular-nums sm:w-24">{num(item.amount)}</span>
                </div>
              ))
            )}
          </div>

          <div className="rounded-xl border-l-4 border-orange-500 bg-orange-50/60 p-3 text-xs leading-relaxed text-slate-700">
            よく使う上位{balance.topConsumers.count}人で、使った量の {pct(balance.topConsumers.shareOfTotalPct)}(
            {num(balance.topConsumers.consumedNet)})。その人たちが無料でもらった量は、使った分の{" "}
            <span className="font-bold">{pct(balance.topConsumers.selfFundedPct)}</span>(
            {num(balance.topConsumers.freeGranted)})です。
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-bold text-slate-800">日ごとの出入りと出来事の印</p>
            <AdminPercoinDailyFlowChartPanel daily={balance.daily} events={balance.events} />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-bold text-slate-800">
              今の使い方で、残高があと何日もつか(消費した {num(balance.consumerCount)}人)
            </p>
            {balance.runway.map((r) => (
              <div key={r.key} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 text-slate-700">{r.label}</span>
                <Bar value={r.users} max={runwayMax} color={r.low ? "#F97316" : "#C4B5FD"} />
                <span className="w-12 shrink-0 text-right tabular-nums">{num(r.users)}人</span>
              </div>
            ))}
            {balance.nonPositiveCount > 0 ? (
              <p className="text-xs text-slate-500">
                ほかに {num(balance.nonPositiveCount)}人は、返金が消費より多く(正味0以下)、日数を出していません。
              </p>
            ) : null}
          </div>

          <details className="rounded-xl border border-slate-200 p-3 text-xs">
            <summary className="cursor-pointer font-bold text-slate-800">
              残りが{LOW_RUNWAY_MAX_DAYS}日以内の人({num(balance.lowRunwayUsers.length)}
              {balance.lowRunwayHasMore ? "人より多い" : "人"})= 買う一歩手前の人の候補
            </summary>
            {balance.lowRunwayUsers.length === 0 ? (
              <p className="mt-2 text-slate-500">いません。</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {balance.lowRunwayUsers.map((u) => (
                  <li key={u.userId} className="flex items-center justify-between gap-3 py-1.5">
                    <a
                      href={`/admin/users/${u.userId}`}
                      className="min-w-0 truncate text-violet-700 underline-offset-2 hover:underline"
                    >
                      {u.nickname ?? "(名前未設定)"}
                    </a>
                    <span className="shrink-0 tabular-nums text-slate-600">
                      残高 {num(u.balance)}・あと {u.daysLeft}日
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {balance.lowRunwayHasMore ? (
              <p className="mt-2 text-slate-500">ほかにもいます(残りの日数が少ない順に{LOW_RUNWAY_LIST_LIMIT}人まで表示)。</p>
            ) : null}
          </details>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewError({ failed }: { failed: string[] }) {
  return (
    <Card className="border-rose-200 bg-rose-50/60 shadow-sm">
      <CardContent className="flex items-start gap-3 p-5 text-sm text-rose-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <p className="font-bold">概要の数字を取得できませんでした</p>
          <p className="mt-1 text-xs">
            取れなかったもの: {failed.join("・")}。まちがった数を出さないよう、概要の数字は出していません。ほかのカードはそのまま使えます。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

async function AdminGrowthOverviewLoader({
  overviewPromise,
  rangeLabel,
}: {
  overviewPromise: Promise<GrowthOverviewResult>;
  rangeLabel: string;
}) {
  const result = await overviewPromise;
  if (result.status === "error") {
    return <OverviewError failed={result.failed} />;
  }
  const { data } = result;
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        {rangeLabel}と、その前の同じ長さの期間を比べています。運営と内部アカウント({num(data.excludedUserCount)}人)を除いています。
      </p>
      <WeeklyAnswerCard answer={data.answer} />
      <RevenueTreeCard
        tree={data.tree}
        stuck={
          data.answer.finding.kind === "payer_rate_down"
            ? "payer_rate"
            : data.answer.finding.kind === "active_users_down"
              ? "active_users"
              : null
        }
      />
      <PercoinBalanceCard balance={data.balance} />
    </div>
  );
}

function AdminGrowthOverviewSkeleton() {
  return (
    <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
      概要を集計中...
    </div>
  );
}

/** 「すべて」タブの一番上に置く概要(①今週の答え・②売上のツリー・③ペルコインの釣り合い)。 */
export function AdminGrowthOverviewSection(props: {
  overviewPromise: Promise<GrowthOverviewResult>;
  rangeLabel: string;
}) {
  return (
    <section className="space-y-3" aria-label="概要">
      <h2 className="text-xl font-bold text-slate-900" style={HEADING_STYLE}>
        概要(売上への道筋)
      </h2>
      <Suspense fallback={<AdminGrowthOverviewSkeleton />}>
        <AdminGrowthOverviewLoader {...props} />
      </Suspense>
    </section>
  );
}
