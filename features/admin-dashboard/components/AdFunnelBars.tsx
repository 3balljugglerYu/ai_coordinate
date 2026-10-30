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
import { ratio } from "../lib/ad-stats/summarize-ad-stats";
import { GROWTH_MIN_SAMPLE } from "../lib/growth-overview-types";

/**
 * 道のり: 媒体ごとに、クリック → ページを開いた → 登録 → 生成 → 投稿 の横棒。
 * 棒の長さは最初の段（クリック）を100%にした割合。0でない段は細くても見えるようにする。
 * いちばん落ちた段（前の段が30以上ある段の中で、進んだ割合がいちばん低い段）を文で出す。
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

function stepAmount(step: AdFunnelStep): string {
  return `${formatCount(step.value)}${step.unit}`;
}

function rateText(step: AdFunnelStep, previous: AdFunnelStep | undefined): string {
  if (!previous) return "";
  if (step.tooFewToJudge) {
    return `まだ判断できません（${AD_FUNNEL_STEP_LABELS[previous.key]}が${stepAmount(previous)}）`;
  }
  if (step.rateFromPrevious === null) return "";
  return `${AD_FUNNEL_STEP_LABELS[previous.key]}の${formatPercent(step.rateFromPrevious)}`;
}

function FunnelCard({ funnel }: { funnel: PlatformFunnel }) {
  const color = AD_PLATFORM_COLORS[funnel.platform];
  const top = funnel.steps[0]?.value ?? 0;
  const clicks = funnel.steps.find((step) => step.key === "linkClicks")?.value ?? null;
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
          {formatPercent(ratio(clicks, funnel.impressions))}
        </span>
      </div>

      <ol className="mt-3 space-y-2.5">
        {funnel.steps.map((step, index) => {
          const width = top > 0 ? (step.value / top) * 100 : 0;
          const rate = rateText(step, funnel.steps[index - 1]);
          return (
            <li key={step.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1">
              <span className="text-xs font-medium text-slate-700">
                {AD_FUNNEL_STEP_LABELS[step.key]}
              </span>
              <div
                className="h-2.5 self-center rounded-sm bg-slate-100"
                title={`${AD_FUNNEL_STEP_LABELS[step.key]} ${stepAmount(step)}`}
              >
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${width}%`,
                    minWidth: step.value > 0 ? 3 : 0,
                    backgroundColor: color,
                  }}
                />
              </div>
              <span aria-hidden />
              <span className="text-xs tabular-nums text-slate-600">
                <span className="font-semibold text-slate-900">{stepAmount(step)}</span>
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
          {weakest && beforeWeakest
            ? `いちばん落ちたのは「${AD_FUNNEL_STEP_LABELS[beforeWeakest.key]} → ${AD_FUNNEL_STEP_LABELS[weakest.key]}」です（${stepAmount(beforeWeakest)} → ${stepAmount(weakest)}）。`
            : `まだ判断できません（どの段も、前の段が${GROWTH_MIN_SAMPLE}に届いていません）。`}
        </p>
      ) : null}
      {funnel.sourcedAdCount === 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          広告に目印を選ぶと、登録から先の段が出ます。
        </p>
      ) : funnel.sourcedAdCount < funnel.adCount ? (
        <p className="mt-1 text-xs text-slate-500">
          目印のない広告が{funnel.adCount - funnel.sourcedAdCount}本あります。その広告から来た人は、登録から先に入っていません。
        </p>
      ) : null}
    </div>
  );
}
