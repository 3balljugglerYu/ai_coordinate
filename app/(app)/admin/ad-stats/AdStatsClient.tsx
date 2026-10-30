"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { AdBreakdownBars } from "@/features/admin-dashboard/components/AdBreakdownBars";
import { AdDailyChartsPanel } from "@/features/admin-dashboard/components/AdDailyChartsPanel";
import { AdFunnelBars } from "@/features/admin-dashboard/components/AdFunnelBars";
import type { AdStatsOverview } from "@/features/admin-dashboard/lib/ad-stats/ad-stats-repository";
import { AD_PLATFORM_LABELS } from "@/features/admin-dashboard/lib/ad-stats/ad-stats-types";
import {
  formatCount as count,
  formatPercent as percent,
  formatPerUnit as perUnit,
  formatYen as yen,
} from "@/features/admin-dashboard/lib/ad-stats/format-ad-stats";
import { ratio, type AdSummary } from "@/features/admin-dashboard/lib/ad-stats/summarize-ad-stats";
import { GROWTH_MIN_SAMPLE } from "@/features/admin-dashboard/lib/growth-overview-types";

const TH = "px-3 py-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap";
const TD = "px-3 py-2 text-sm text-slate-900 whitespace-nowrap tabular-nums";

function ImportForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  // 取り込んだあとに、ファイルの欄を空に戻す（同じ名前のファイルを選び直せるように）
  const [inputKey, setInputKey] = useState(0);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/ad-stats/import", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        platform?: "meta" | "x";
        rows?: number;
        dateFrom?: string;
        dateTo?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "取り込めませんでした");
      toast({
        title: "取り込みました",
        description: `${AD_PLATFORM_LABELS[json.platform ?? "meta"]}・${json.dateFrom}〜${json.dateTo}・${json.rows}行`,
      });
      setFile(null);
      setInputKey((key) => key + 1);
      router.refresh();
    } catch (error) {
      toast({
        title: "取り込めませんでした",
        description: error instanceof Error ? error.message : "もう一度お試しください",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">書き出しを取り込む</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
        <li>
          Meta: 広告マネージャの「レポート」で、「内訳」→「時間」→「日」を選び、年齢か配置も選んで CSV で書き出す
        </li>
        <li>X: 広告の画面の「書き出し」で、日ごとの xlsx をそのまま選ぶ</li>
        <li>同じ日・同じ広告の数字は上書きされます。同じファイルを何度取り込んでも大丈夫です</li>
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          key={inputKey}
          type="file"
          accept=".csv,.xlsx"
          className="max-w-sm"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <Button onClick={submit} disabled={!file || busy}>
          {busy ? "取り込み中…" : "取り込む"}
        </Button>
      </div>
    </section>
  );
}

const SIGNUP_SOURCE_LIST_ID = "ad-signup-source-options";

function SignupSourceEditor({ ad }: { ad: AdSummary }) {
  const router = useRouter();
  const { toast } = useToast();
  const [value, setValue] = useState(ad.signupSource ?? "");
  const [busy, setBusy] = useState(false);
  const changed = value.trim().toLowerCase() !== (ad.signupSource ?? "");

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ad-stats/ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: ad.platform, adKey: ad.adKey, signupSource: value }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "保存できませんでした");
      router.refresh();
    } catch (error) {
      toast({
        title: "目印を保存できませんでした",
        description: error instanceof Error ? error.message : "もう一度お試しください",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        list={SIGNUP_SOURCE_LIST_ID}
        placeholder="目印を選ぶ"
        aria-label={`${ad.adName} の目印`}
        className="h-8 w-64 text-xs"
        onChange={(event) => setValue(event.target.value)}
      />
      <Button size="sm" variant="outline" onClick={save} disabled={!changed || busy}>
        保存
      </Button>
    </div>
  );
}

function AdsTable({ overview }: { overview: AdStatsOverview }) {
  return (
    <section className="space-y-3">
      <SectionHeading title="広告ごと" question="どの広告が、いくらで、何人を連れてきた？" />
      <p className="text-sm text-slate-600">
        目印（登録のときに残る流入元）を選ぶと、その広告から来て登録・生成・投稿した人数が出ます。数えるのは、広告の最初の日から最後の日の7日後までの登録で、運営の登録は数えません。
        同じ目印を使う広告どうしは分けられないので、人数はその広告たちの合算です。
        Meta の「ページを開いた」は広告のリンクから実際にページが開いた数です（X には無い数字です）。
      </p>
      <datalist id={SIGNUP_SOURCE_LIST_ID}>
        {overview.signupSourceOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className={TH}>媒体・広告</th>
              <th className={TH}>期間</th>
              <th className={TH}>使った額</th>
              <th className={TH}>表示</th>
              <th className={TH}>クリック（率）</th>
              <th className={TH}>1クリック</th>
              <th className={TH}>ページを開いた（1回）</th>
              <th className={TH}>目印</th>
              <th className={TH}>登録</th>
              <th className={TH}>生成まで</th>
              <th className={TH}>投稿まで</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {overview.ads.map((ad) => (
              <tr key={`${ad.platform}:${ad.adKey}`}>
                <td className={TD}>
                  <Badge variant="outline" className="mr-2">
                    {AD_PLATFORM_LABELS[ad.platform]}
                  </Badge>
                  {ad.adName}
                </td>
                <td className={TD}>
                  {ad.firstDate}〜{ad.lastDate}
                </td>
                <td className={TD}>{yen(ad.spendJpy)}</td>
                <td className={TD}>{count(ad.impressions)}</td>
                <td className={TD}>
                  {count(ad.linkClicks)}（{percent(ratio(ad.linkClicks, ad.impressions))}）
                </td>
                <td className={TD}>{perUnit(ad.spendJpy, ad.linkClicks)}</td>
                <td className={TD}>
                  {ad.landingPageViews === null
                    ? "—"
                    : `${count(ad.landingPageViews)}（${perUnit(ad.spendJpy, ad.landingPageViews)}）`}
                </td>
                <td className={TD}>
                  <SignupSourceEditor ad={ad} />
                </td>
                <td className={TD}>
                  {ad.funnel ? `${ad.funnel.signups}人` : "—"}
                  {ad.sharesSignupSource && (
                    <Badge variant="secondary" className="ml-2">
                      合算
                    </Badge>
                  )}
                </td>
                <td className={TD}>{ad.funnel ? `${ad.funnel.generated}人` : "—"}</td>
                <td className={TD}>{ad.funnel ? `${ad.funnel.posted}人` : "—"}</td>
              </tr>
            ))}
            {overview.totals.map((total) => (
              <tr key={`total:${total.platform}`} className="bg-slate-50 font-semibold">
                <td className={TD}>{AD_PLATFORM_LABELS[total.platform]} の合計</td>
                <td className={TD} />
                <td className={TD}>{yen(total.spendJpy)}</td>
                <td className={TD}>{count(total.impressions)}</td>
                <td className={TD}>
                  {count(total.linkClicks)}（{percent(ratio(total.linkClicks, total.impressions))}）
                </td>
                <td className={TD}>{perUnit(total.spendJpy, total.linkClicks)}</td>
                <td className={TD}>
                  {total.landingPageViews === null
                    ? "—"
                    : `${count(total.landingPageViews)}（${perUnit(total.spendJpy, total.landingPageViews)}）`}
                </td>
                <td className={TD} colSpan={4} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * 管理画面の決まりに合わせて、答える問いの順に上から並べる:
 * 道のり（どこで止まった？）→ 日ごと（何をした日に、何が変わった？）→ 広告ごとの表 →
 * 誰に届いたか。取り込みはときどきしか使わないので一番下。
 */
export function AdStatsClient({ overview }: { overview: AdStatsOverview | null }) {
  return (
    <div className="space-y-10">
      {overview ? (
        <AdStatsBody overview={overview} />
      ) : (
        <p className="text-sm text-red-700">
          広告の数字を読めませんでした。少し待ってから開き直してください（下の欄から取り込みはできます）。
        </p>
      )}
      <ImportForm />
    </div>
  );
}

function SectionHeading({ title, question }: { title: string; question: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500">{question}</p>
    </div>
  );
}

function AdStatsBody({ overview }: { overview: AdStatsOverview }) {
  const platforms = overview.funnels.map((funnel) => funnel.platform);
  if (overview.ads.length === 0 && overview.groups.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        まだ取り込んだ広告がありません。下の欄から、広告の書き出しを取り込んでください。
      </p>
    );
  }
  return (
    <>
      {overview.funnels.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading title="道のり" question="広告のお金は、どこで止まった？" />
          <p className="text-sm text-slate-600">
            クリックとページを開いたは「回」、登録から先は「人」で、数え方が違います。割合は目安です。
            前の段が{GROWTH_MIN_SAMPLE}に届かない段は「まだ判断できません」と出します。
          </p>
          <AdFunnelBars funnels={overview.funnels} />
        </section>
      ) : null}

      {overview.dailyChart ? (
        <section className="space-y-3">
          <SectionHeading title="日ごとの動き" question="何をした日に、何が変わった？" />
          <AdDailyChartsPanel
            chart={overview.dailyChart}
            platforms={platforms}
            hasSignupSources={overview.funnels.some((funnel) => funnel.sourcedAdCount > 0)}
          />
        </section>
      ) : null}

      {overview.ads.length > 0 ? <AdsTable overview={overview} /> : null}

      {overview.groups.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title="誰に届いたか" question="届けたい相手に届いた？" />
          <p className="text-sm text-slate-600">
            Meta は広告ごと、X は書き出し全体の数字です（X の書き出しの年齢・性別・端末は、広告ごとに分かれていません）。
          </p>
          <AdBreakdownBars groups={overview.groups} />
        </section>
      )}
    </>
  );
}
