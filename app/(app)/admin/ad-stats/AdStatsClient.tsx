"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import type { AdStatsOverview } from "@/features/admin-dashboard/lib/ad-stats/ad-stats-repository";
import {
  AD_BREAKDOWN_LABELS,
  AD_PLATFORM_LABELS,
  type AdBreakdownType,
} from "@/features/admin-dashboard/lib/ad-stats/ad-stats-types";
import {
  ratio,
  type AdSummary,
  type BreakdownGroup,
} from "@/features/admin-dashboard/lib/ad-stats/summarize-ad-stats";

const yen = (value: number | null) =>
  value === null ? "—" : `${Math.round(value).toLocaleString("ja-JP")}円`;
const count = (value: number | null) => (value === null ? "—" : value.toLocaleString("ja-JP"));
const percent = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(value < 0.01 ? 3 : 2)}%`;
const perUnit = (spend: number, units: number | null) => yen(ratio(spend, units));

const VALUE_LABELS: Record<string, string> = {
  male: "男性",
  female: "女性",
  unknown: "不明",
};

function valueLabel(type: AdBreakdownType, value: string): string {
  if (type === "gender" || value === "unknown") return VALUE_LABELS[value] ?? value;
  return value;
}

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
  if (overview.ads.length === 0) {
    return <p className="text-sm text-slate-600">まだ取り込んだ広告がありません。</p>;
  }
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">広告ごと</h2>
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

function BreakdownSection({ group }: { group: BreakdownGroup }) {
  return (
    <details className="rounded-md border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-900">
        <Badge variant="outline" className="mr-2">
          {AD_PLATFORM_LABELS[group.platform]}
        </Badge>
        {group.adName}（{group.firstDate}〜{group.lastDate}）
      </summary>
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
                    <td className={TD}>{valueLabel(breakdown.type, item.value)}</td>
                    <td className={TD}>
                      {yen(item.spendJpy)}（{percent(item.spendShare)}）
                    </td>
                    <td className={TD}>{count(item.impressions)}</td>
                    <td className={TD}>
                      {count(item.linkClicks)}（{percent(ratio(item.linkClicks, item.impressions))}）
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </details>
  );
}

export function AdStatsClient({ overview }: { overview: AdStatsOverview | null }) {
  return (
    <div className="space-y-8">
      <ImportForm />
      {overview ? (
        <AdStatsBody overview={overview} />
      ) : (
        <p className="text-sm text-red-700">
          広告の数字を読めませんでした。少し待ってから開き直してください（取り込みはできます）。
        </p>
      )}
    </div>
  );
}

function AdStatsBody({ overview }: { overview: AdStatsOverview }) {
  return (
    <>
      <AdsTable overview={overview} />
      {overview.groups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">誰に届いたか（内訳）</h2>
          <p className="text-sm text-slate-600">
            Meta は広告ごと、X は書き出し全体の数字です（X の書き出しの年齢・性別・端末は、広告ごとに分かれていません）。
          </p>
          <div className="space-y-2">
            {overview.groups.map((group) => (
              <BreakdownSection key={`${group.platform}:${group.adKey}`} group={group} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
