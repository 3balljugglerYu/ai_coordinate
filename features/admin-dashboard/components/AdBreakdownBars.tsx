"use client";

import { useState } from "react";
import {
  AD_BREAKDOWN_LABELS,
  AD_PLATFORM_COLORS,
  AD_PLATFORM_LABELS,
  type AdBreakdownType,
} from "../lib/ad-stats/ad-stats-types";
import {
  formatBreakdownValue,
  formatCount,
  formatPercent,
  formatShare,
  formatYen,
} from "../lib/ad-stats/format-ad-stats";
import {
  ratio,
  type BreakdownGroup,
  type BreakdownItem,
} from "../lib/ad-stats/summarize-ad-stats";

/** 横棒に出す行の数。これより多い分は「そのほか」にまとめる（表には全部出す） */
export const BREAKDOWN_BAR_LIMIT = 8;

const TH = "px-3 py-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap";
const TD = "px-3 py-2 text-sm text-slate-900 whitespace-nowrap tabular-nums";

interface BarRow {
  label: string;
  spendShare: number;
  clickRate: number | null;
}

function barRows(type: AdBreakdownType, items: BreakdownItem[]): BarRow[] {
  const rows = items.slice(0, BREAKDOWN_BAR_LIMIT).map((item) => ({
    label: formatBreakdownValue(type, item.value),
    spendShare: item.spendShare,
    clickRate: ratio(item.linkClicks, item.impressions),
  }));
  const rest = items.slice(BREAKDOWN_BAR_LIMIT);
  if (rest.length > 0) {
    const clicks = rest.some((item) => item.linkClicks !== null)
      ? rest.reduce((sum, item) => sum + (item.linkClicks ?? 0), 0)
      : null;
    rows.push({
      label: `そのほか（${rest.length}件）`,
      spendShare: rest.reduce((sum, item) => sum + item.spendShare, 0),
      clickRate: ratio(
        clicks,
        rest.reduce((sum, item) => sum + item.impressions, 0),
      ),
    });
  }
  return rows;
}

/**
 * 誰に届いたか: 広告（X は書き出し全体）を1つ選び、年齢・性別・出した場所・端末・地域ごとに、
 * 使った額の割合を横棒で、クリック率を数字で出す。数字の表は「表で見る」に残す。
 */
export function AdBreakdownBars({ groups }: { groups: BreakdownGroup[] }) {
  const [selected, setSelected] = useState(0);
  const group = groups[Math.min(selected, groups.length - 1)];
  if (!group) return null;
  const color = AD_PLATFORM_COLORS[group.platform];

  return (
    <div className="space-y-4">
      <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span className="font-medium">広告</span>
        <select
          value={selected}
          onChange={(event) => setSelected(Number(event.target.value))}
          className="h-9 min-w-0 max-w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900"
        >
          {groups.map((item, index) => (
            <option key={`${item.platform}:${item.adKey}`} value={index}>
              {AD_PLATFORM_LABELS[item.platform]}・{item.adName}（{item.firstDate}〜{item.lastDate}）
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 lg:grid-cols-2">
        {group.breakdowns.map((breakdown) => (
          <div key={breakdown.type} className="min-w-0 rounded-md border border-slate-200 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-900">
                {AD_BREAKDOWN_LABELS[breakdown.type]}
              </h4>
              <span className="text-xs text-slate-500">使った額の割合・クリック率</span>
            </div>
            <ul className="mt-3 space-y-2.5">
              {barRows(breakdown.type, breakdown.items).map((row) => (
                <li key={row.label} className="space-y-1">
                  {/* 出した場所・地域は名前が長いので、名前は棒の上の行に出す */}
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="min-w-0 break-words text-slate-700">{row.label}</span>
                    <span className="shrink-0 tabular-nums text-slate-600">
                      <span className="font-semibold text-slate-900">
                        {formatShare(row.spendShare)}
                      </span>
                      ・{formatPercent(row.clickRate)}
                    </span>
                  </div>
                  <div className="h-2 rounded-sm bg-slate-100">
                    <div
                      className="h-full rounded-sm"
                      style={{
                        width: `${row.spendShare * 100}%`,
                        minWidth: row.spendShare > 0 ? 3 : 0,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <details className="rounded-md border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-900">表で見る</summary>
        <BreakdownTables group={group} />
      </details>
    </div>
  );
}

function BreakdownTables({ group }: { group: BreakdownGroup }) {
  return (
    <div className="mt-3 grid gap-4 lg:grid-cols-2">
      {group.breakdowns.map((breakdown) => (
        <div key={breakdown.type} className="min-w-0 overflow-x-auto">
          <h4 className="mb-1 text-xs font-semibold text-slate-600">
            {AD_BREAKDOWN_LABELS[breakdown.type]}
          </h4>
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr>
                <th className={TH}>{AD_BREAKDOWN_LABELS[breakdown.type]}</th>
                <th className={TH}>使った額（割合）</th>
                <th className={TH}>表示</th>
                <th className={TH}>クリック（率）</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {breakdown.items.map((item) => (
                <tr key={item.value}>
                  <td className={TD}>{formatBreakdownValue(breakdown.type, item.value)}</td>
                  <td className={TD}>
                    {formatYen(item.spendJpy)}（{formatPercent(item.spendShare)}）
                  </td>
                  <td className={TD}>{formatCount(item.impressions)}</td>
                  <td className={TD}>
                    {formatCount(item.linkClicks)}（
                    {formatPercent(ratio(item.linkClicks, item.impressions))}）
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
