import type { PercoinAnalytics } from "@/features/admin-dashboard/lib/build-percoin-analytics";
import {
  AdminCollectionReading,
  AdminCollectionSection,
} from "./AdminCollectionSection";

/*
  セクションの体裁は企画レポート(コレクションタブ)と同じ部品を使う。
  「番号どおりに上から読めば分かる」形が手集計のレポートで効いたので、
  ペルコイン側も同じ読み方にそろえる。部品名に Collection が付くのは
  出自がそちらというだけで、中身は汎用のセクション枠。
*/

function formatNumber(value: number): string {
  return value.toLocaleString("ja-JP");
}

function formatSignedPercent(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}

function changeToneClass(value: number | null): string {
  if (value === null) return "text-slate-400";
  // 配布は「増えた＝コストが増えた」なので、増加を赤で出す
  if (value > 0) return "text-rose-600";
  if (value < 0) return "text-emerald-600";
  return "text-slate-500";
}

/**
 * ペルコインの配布状況タブ。
 *
 * 目的は「どこに配りすぎているか」と「額を変えたあと継続がどう動いたか」を
 * 並べて見ること。個人別の保有一覧は /admin/credits-summary にあるので
 * ここには置かない（同じ数字を2箇所に出すと食い違う）。
 */
export function AdminPercoinView({
  analytics,
  rangeLabel,
}: {
  analytics: PercoinAnalytics;
  rangeLabel: string;
}) {
  const { checkin, distribution } = analytics;

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-5 text-slate-600">
        期間は{rangeLabel}、比較は同じ長さのひとつ前の期間です。運営・テスト用の
        {analytics.operatorExcludedCount}名を除外しています（含めると保有の分布が大きく歪みます）。
      </p>

      <AdminCollectionSection
        step={1}
        title="配布の内訳"
        description="どこに配っているか。額を下げる判断は、まずここの上位から考える。"
      >
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-bold tabular-nums text-slate-900">
            {formatNumber(analytics.totalGranted)}
            <span className="ml-1 text-sm font-normal text-slate-500">pc</span>
          </span>
          <span
            className={`text-sm font-semibold tabular-nums ${changeToneClass(analytics.totalChangePercent)}`}
          >
            {formatSignedPercent(analytics.totalChangePercent)}
          </span>
          <span className="text-[11px] text-slate-500">
            前期 {formatNumber(analytics.previousTotalGranted)} pc
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-1.5 pr-2 font-medium">付与元</th>
                <th className="py-1.5 pr-2 text-right font-medium">配布額</th>
                <th className="py-1.5 pr-2 text-right font-medium">構成比</th>
                <th className="py-1.5 pr-2 text-right font-medium">前期比</th>
                <th className="py-1.5 pr-2 text-right font-medium">件数</th>
                <th className="py-1.5 text-right font-medium">人数</th>
              </tr>
            </thead>
            <tbody>
              {analytics.grants.map((grant) => (
                <tr key={grant.source} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2 text-slate-800">{grant.label}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-slate-900">
                    {formatNumber(grant.totalAmount)}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">
                    {grant.sharePercent}%
                  </td>
                  <td
                    className={`py-1.5 pr-2 text-right tabular-nums ${changeToneClass(grant.changePercent)}`}
                  >
                    {formatSignedPercent(grant.changePercent)}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">
                    {formatNumber(grant.grantCount)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600">
                    {formatNumber(grant.userCount)}
                  </td>
                </tr>
              ))}
              {analytics.grants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-3 text-center text-slate-500">
                    この期間の配布はありません
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {analytics.grants[0] ? (
          <AdminCollectionReading>
            最も多いのは「{analytics.grants[0].label}」で、配布総額の
            {analytics.grants[0].sharePercent}%（{formatNumber(analytics.grants[0].totalAmount)} pc）。
          </AdminCollectionReading>
        ) : null}
      </AdminCollectionSection>

      <AdminCollectionSection
        step={2}
        title="連続ログインの到達率"
        description="期間内に1日目を迎えた人だけを追ったコホート。母数は「その日数に到達しうるだけの日が経っている人」。"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-1.5 pr-2 font-medium">日数</th>
                <th className="py-1.5 pr-2 text-right font-medium">到達</th>
                <th className="py-1.5 pr-2 text-right font-medium">母数</th>
                <th className="py-1.5 pr-2 text-right font-medium">到達率</th>
                <th className="py-1.5 text-right font-medium">前期</th>
              </tr>
            </thead>
            <tbody>
              {analytics.streakReach.map((row) => (
                <tr key={row.day} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2 tabular-nums text-slate-800">
                    {row.day}日目
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-900">
                    {formatNumber(row.userCount)}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">
                    {formatNumber(row.eligibleCount)}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-slate-900">
                    {/* 母数0は「まだ到達しうる時期に来ていない」であって 0% ではない */}
                    {row.reachPercent === null ? "—" : `${row.reachPercent}%`}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500">
                    {row.previousReachPercent === null
                      ? "—"
                      : `${row.previousReachPercent}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {analytics.streakFirstDropPercent !== null ? (
          <AdminCollectionReading>
            この期間に始めた人のうち、2日目まで続かなかったのは
            {analytics.streakFirstDropPercent}%です。落ち方が最も大きいのはここなので、
            日数を伸ばす施策より「2日目に戻ってくる理由」を作る方が効きます。
          </AdminCollectionReading>
        ) : null}
      </AdminCollectionSection>

      <AdminCollectionSection
        step={3}
        title="チェックインの到達率"
        description="新規登録のうち、チェックインを一度でも押した割合。押していない人は導線に気づいていない。"
      >
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-[11px] text-slate-500">新規登録</p>
            <p className="text-xl font-bold tabular-nums text-slate-900">
              {formatNumber(checkin.signupCount)}
              <span className="ml-1 text-xs font-normal text-slate-500">人</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">チェックイン済み</p>
            <p className="text-xl font-bold tabular-nums text-slate-900">
              {checkin.reachPercent === null ? "—" : `${checkin.reachPercent}%`}
              <span className="ml-1 text-xs font-normal text-slate-500">
                （{formatNumber(checkin.checkedInCount)}人）
              </span>
            </p>
            <p className="text-[11px] tabular-nums text-slate-500">
              前期{" "}
              {checkin.previousReachPercent === null
                ? "—"
                : `${checkin.previousReachPercent}%`}
              {checkin.reachPointDiff === null
                ? null
                : ` （${checkin.reachPointDiff > 0 ? "+" : ""}${checkin.reachPointDiff}pt）`}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">一度も押していない</p>
            <p className="text-xl font-bold tabular-nums text-rose-600">
              {formatNumber(checkin.notCheckedInCount)}
              <span className="ml-1 text-xs font-normal text-slate-500">人</span>
            </p>
          </div>
        </div>

        {checkin.notCheckedInCount > 0 ? (
          <AdminCollectionReading>
            チェックインは /challenge にしかありません。押していない
            {formatNumber(checkin.notCheckedInCount)}人は、額の問題ではなく
            存在を知らない可能性があります。
          </AdminCollectionReading>
        ) : null}
      </AdminCollectionSection>

      <AdminCollectionSection
        step={4}
        title="保有の分布（現在値）"
        description="期間ではなく今この瞬間の残高。誰が持っているかより、どう散らばっているか。個人別は「ペルコイン集計」を参照。"
      >
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-[11px] text-slate-500">保有者</p>
            <p className="text-xl font-bold tabular-nums text-slate-900">
              {formatNumber(distribution.holderCount)}
              <span className="ml-1 text-xs font-normal text-slate-500">人</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">残高合計</p>
            <p className="text-xl font-bold tabular-nums text-slate-900">
              {formatNumber(distribution.totalBalance)}
              <span className="ml-1 text-xs font-normal text-slate-500">pc</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">中央値</p>
            <p className="text-xl font-bold tabular-nums text-slate-900">
              {distribution.medianBalance === null
                ? "—"
                : formatNumber(Math.round(distribution.medianBalance))}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">上位10%</p>
            <p className="text-xl font-bold tabular-nums text-slate-900">
              {distribution.top10PercentShare === null
                ? "—"
                : `${distribution.top10PercentShare}%`}
            </p>
          </div>
        </div>

        {distribution.medianBalance !== null &&
        distribution.p90Balance !== null ? (
          <AdminCollectionReading>
            中央値 {formatNumber(Math.round(distribution.medianBalance))} pc に対して
            上位10%が残高全体の{distribution.top10PercentShare}%を保有（p90 は
            {formatNumber(Math.round(distribution.p90Balance))} pc）。
            偏りが大きいほど、一律の減額は中央値の人に強く効きます。
          </AdminCollectionReading>
        ) : null}
      </AdminCollectionSection>
    </div>
  );
}
