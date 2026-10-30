/**
 * 「広告の成果」の画面の並び。
 *
 * ここで守ること:
 *  - 答える問いの順（道のり → 日ごとの動き → 広告ごと → 誰に届いたか）、取り込みは一番下
 *  - 広告ごとの行が無くても、内訳（X の書き出し全体）があれば「誰に届いたか」は出す
 *  - 何も無ければ「まだ取り込んだ広告がありません」と、取り込みの欄だけを出す
 */

import { render, screen } from "@testing-library/react";
import { AdStatsClient } from "@/app/(app)/admin/ad-stats/AdStatsClient";
import type { AdStatsOverview } from "@/features/admin-dashboard/lib/ad-stats/ad-stats-repository";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/features/admin-dashboard/components/AdDailyChartsPanel", () => ({
  AdDailyChartsPanel: () => <div>日ごとのグラフ</div>,
}));

const EMPTY: AdStatsOverview = {
  ads: [],
  totals: [],
  groups: [],
  signupSourceOptions: [],
  funnels: [],
  dailyChart: null,
};

const GROUP: AdStatsOverview["groups"][number] = {
  platform: "x",
  adKey: "all:1",
  adName: "この書き出しの広告すべて（変身）",
  firstDate: "2026-10-25",
  lastDate: "2026-10-29",
  breakdowns: [
    {
      type: "age",
      items: [
        {
          value: "25-34",
          spendShare: 1,
          spendJpy: 100,
          impressions: 10,
          linkClicks: 1,
          landingPageViews: null,
          videoViews: null,
        },
      ],
    },
  ],
};

function headings(): string[] {
  return screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent ?? "");
}

describe("AdStatsClient", () => {
  it("何も無ければ案内と取り込みの欄だけを出す", () => {
    render(<AdStatsClient overview={EMPTY} />);

    expect(
      screen.getByText("まだ取り込んだ広告がありません。下の欄から、広告の書き出しを取り込んでください。"),
    ).toBeInTheDocument();
    expect(headings()).toEqual(["書き出しを取り込む"]);
  });

  it("広告ごとの行が無くても、内訳があれば「誰に届いたか」を出す", () => {
    render(<AdStatsClient overview={{ ...EMPTY, groups: [GROUP] }} />);

    expect(headings()).toEqual(["誰に届いたか", "書き出しを取り込む"]);
    expect(screen.queryByText(/まだ取り込んだ広告がありません/)).not.toBeInTheDocument();
  });

  it("答える問いの順に並べ、取り込みは一番下", () => {
    const ad = {
      platform: "x" as const,
      adKey: "1",
      adName: "変身",
      firstDate: "2026-10-25",
      lastDate: "2026-10-29",
      spendJpy: 100,
      impressions: 10,
      linkClicks: 1,
      landingPageViews: null,
      videoViews: null,
      signupSource: null,
      sharesSignupSource: false,
      funnel: null,
    };
    render(
      <AdStatsClient
        overview={{
          ...EMPTY,
          ads: [ad],
          groups: [GROUP],
          funnels: [
            {
              platform: "x",
              spendJpy: 100,
              impressions: 10,
              clickRate: 0.1,
              steps: [],
              weakestStep: null,
              adCount: 1,
              sourcedAdCount: 0,
            },
          ],
          dailyChart: { rows: [], events: [], endsToday: false, signupsAvailable: true },
        }}
      />,
    );

    expect(headings()).toEqual(["道のり", "日ごとの動き", "広告ごと", "誰に届いたか", "書き出しを取り込む"]);
  });
});
