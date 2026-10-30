import { AD_PLATFORM_COLORS, AD_PLATFORM_LABELS } from "../lib/ad-stats/ad-stats-types";
import {
  AD_FUNNEL_STEP_LABELS,
  type AdFunnelStep,
  type PlatformFunnel,
} from "../lib/ad-stats/build-ad-charts";
import {
  formatCount,
  formatPercent,
  formatYen,
} from "../lib/ad-stats/format-ad-stats";
import { GROWTH_MIN_SAMPLE } from "../lib/growth-overview-types";
import { AdminBar } from "./AdminBar";

/**
 * 道のり: 媒体ごとに、クリック → ページを開いた → 登録 → 生成 → 投稿 の横棒。
 * 棒の長さは、いちばん大きい段を100%にした割合（目印には広告以外から来た人の登録も付くので、
 * 登録がクリックより多いこともある）。いちばん落ちた段（分母が30以上ある段の中で、
 * 進んだ割合がいちばん低い段）を文で出す。
 */
export function AdFunnelBars({ funnels }: { funnels: PlatformFunnel[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {funnels.map((funnel) => (
        <FunnelCard key={funnel.platform} funnel={funnel} />
      ))}
    </div>
  );
}

function amount(value: number, unit: AdFunnelStep["unit"]): string {
  return `${formatCount(value)}${unit}`;
}

function rateText(step: AdFunnelStep, previous: AdFunnelStep | undefined): string {
  if (!previous || step.previousValue === null) return "";
  const base = `${AD_FUNNEL_STEP_LABELS[previous.key]}が${amount(step.previousValue, previous.unit)}`;
  if (step.tooFewToJudge) return `まだ判断できません（${base}）`;
  if (step.rateFromPrevious === null) return "";
  return `${AD_FUNNEL_STEP_LABELS[previous.key]}の${formatPercent(step.rateFromPrevious)}`;
}

function FunnelCard({ funnel }: { funnel: PlatformFunnel }) {
  const color = AD_PLATFORM_COLORS[funnel.platform];
  const max = Math.max(...funnel.steps.map((step) => step.value), 0);
  const weakestIndex = funnel.steps.findIndex((step) => step.key === funnel.weakestStep);
  const weakest = weakestIndex > 0 ? funnel.steps[weakestIndex] : null;
  const beforeWeakest = weakestIndex > 0 ? funnel.steps[weakestIndex - 1] : null;

  return (
    <div className="min-w-0 rounded-md border border-slate-200 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: color }}
          />
          {AD_PLATFORM_LABELS[funnel.platform]}
        </span>
        <span className="text-xs tabular-nums text-slate-600">
          使った額 {formatYen(funnel.spendJpy)}・表示 {formatCount(funnel.impressions)}・クリック率{" "}
          {formatPercent(funnel.clickRate)}
        </span>
      </div>

      <ol className="mt-3 space-y-2.5">
        {funnel.steps.map((step, index) => {
          const rate = rateText(step, funnel.steps[index - 1]);
          return (
            <li
              key={step.key}
              className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1"
            >
              <span className="text-xs font-medium text-slate-700">
                {AD_FUNNEL_STEP_LABELS[step.key]}
              </span>
              <AdminBar value={step.value} max={max} color={color} />
              <span aria-hidden />
              <span className="text-xs tabular-nums text-slate-600">
                <span className="font-semibold text-slate-900">{amount(step.value, step.unit)}</span>
                {rate ? `（${rate}）` : ""}
                {step.costPerUnitJpy !== null
                  ? `・1${step.unit} ${formatYen(step.costPerUnitJpy)}`
                  : ""}
              </span>
            </li>
          );
        })}
      </ol>

      {funnel.steps.length > 1 ? (
        <p className="mt-3 text-sm text-slate-800">
          {weakest && beforeWeakest && weakest.previousValue !== null
            ? `いちばん落ちたのは「${AD_FUNNEL_STEP_LABELS[beforeWeakest.key]} → ${AD_FUNNEL_STEP_LABELS[weakest.key]}」です（${amount(weakest.previousValue, beforeWeakest.unit)} → ${amount(weakest.value, weakest.unit)}）。`
            : `まだ判断できません（どの段も、前の段が${GROWTH_MIN_SAMPLE}に届いていません）。`}
        </p>
      ) : null}
      {funnel.sourcedAdCount === 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          広告に目印を選ぶと、登録から先の段が出ます。
        </p>
      ) : funnel.sourcedAdCount < funnel.adCount ? (
        <p className="mt-1 text-xs text-slate-500">
          目印のない広告（またはほかの媒体と同じ目印の広告）が
          {funnel.adCount - funnel.sourcedAdCount}本あります。登録から先の割合と1人あたりの額は、残りの広告だけで出しています。
        </p>
      ) : null}
    </div>
  );
}
