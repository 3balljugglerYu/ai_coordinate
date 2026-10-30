/**
 * 「広告の成果」の道のりと、誰に届いたかの横棒。
 *
 * ここで守ること:
 *  - 道のりは、いちばん落ちた段を文で出す。前の段が30に届かない段は「まだ判断できません」
 *  - 目印のある広告が無ければ、登録から先の段の代わりに案内を出す
 *  - 誰に届いたかは、選んだ広告の内訳を出し、多い内訳は「そのほか」にまとめる（表には全部出す）
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { AdBreakdownBars, BREAKDOWN_BAR_LIMIT } from "@/features/admin-dashboard/components/AdBreakdownBars";
import { AdFunnelBars } from "@/features/admin-dashboard/components/AdFunnelBars";
import { buildPlatformFunnels } from "@/features/admin-dashboard/lib/ad-stats/build-ad-charts";
import type {
  AdSummary,
  BreakdownGroup,
  BreakdownItem,
} from "@/features/admin-dashboard/lib/ad-stats/summarize-ad-stats";

function ad(overrides: Partial<AdSummary>): AdSummary {
  return {
    platform: "meta",
    adKey: "name:A",
    adName: "A",
    firstDate: "2026-10-16",
    lastDate: "2026-10-29",
    spendJpy: 24088,
    impressions: 34008,
    linkClicks: 1011,
    landingPageViews: 887,
    videoViews: null,
    signupSource: "tag_meta",
    sharesSignupSource: false,
    funnel: { signups: 0, generated: 0, posted: 0 },
    ...overrides,
  };
}

describe("AdFunnelBars", () => {
  it("いちばん落ちた段を文で出し、前の段が30に届かない段は「まだ判断できません」と出す", () => {
    render(<AdFunnelBars funnels={buildPlatformFunnels([ad({})])} />);

    expect(
      screen.getByText("いちばん落ちたのは「ページを開いた → 登録」です（887回 → 0人）。"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/まだ判断できません（登録が0人）/)).toHaveLength(1);
    expect(screen.getByText(/まだ判断できません（生成までが0人）/)).toBeInTheDocument();
    // 1回あたりの額は、数が0の段には出さない
    expect(screen.getByText(/・1回 24円/)).toBeInTheDocument();
    expect(screen.queryByText(/・1人/)).not.toBeInTheDocument();
  });

  it("登録がクリックより多くても（広告以外から来た人にも同じ目印が付く）、棒は枠からはみ出さない", () => {
    const { container } = render(
      <AdFunnelBars
        funnels={buildPlatformFunnels([
          ad({ platform: "x", adKey: "1", linkClicks: 20, landingPageViews: null, funnel: { signups: 35, generated: 0, posted: 0 } }),
        ])}
      />,
    );

    const widths = [...container.querySelectorAll<HTMLElement>("[style*='width']")].map((el) =>
      parseFloat(el.style.width),
    );
    expect(widths.length).toBeGreaterThan(0);
    expect(Math.max(...widths)).toBeLessThanOrEqual(100);
  });

  it("目印のある広告が無ければ、登録から先の段の代わりに案内を出す", () => {
    render(<AdFunnelBars funnels={buildPlatformFunnels([ad({ signupSource: null, funnel: null })])} />);

    expect(screen.queryByText("登録")).not.toBeInTheDocument();
    expect(screen.getByText("広告に目印を選ぶと、登録から先の段が出ます。")).toBeInTheDocument();
  });
});

function item(value: string, spendShare: number): BreakdownItem {
  return {
    value,
    spendShare,
    spendJpy: spendShare * 1000,
    impressions: 100,
    linkClicks: 1,
    landingPageViews: null,
    videoViews: null,
  };
}

describe("AdBreakdownBars", () => {
  const regions = Array.from({ length: BREAKDOWN_BAR_LIMIT + 2 }, (_, i) => item(`地域${i + 1}`, 0.1));
  const groups: BreakdownGroup[] = [
    {
      platform: "meta",
      adKey: "name:A",
      adName: "90作品",
      firstDate: "2026-10-26",
      lastDate: "2026-10-29",
      breakdowns: [{ type: "age", items: [item("45-54", 0.52), item("35-44", 0.48)] }],
    },
    {
      platform: "x",
      adKey: "all:1,2",
      adName: "この書き出しの広告すべて（変身・90作品）",
      firstDate: "2026-10-25",
      lastDate: "2026-10-29",
      breakdowns: [
        { type: "gender", items: [item("male", 0.78), item("female", 0.22)] },
        { type: "location", items: regions },
      ],
    },
  ];

  it("最初は先頭の広告の内訳を出し、選び直すとその広告の内訳に変わる", () => {
    render(<AdBreakdownBars groups={groups} />);

    // 見出しは横棒と「表で見る」の表の両方にある
    expect(screen.getAllByRole("heading", { name: "年齢" }).length).toBeGreaterThan(0);
    expect(screen.getByText("52%")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "x:all:1,2" } });

    expect(screen.queryAllByRole("heading", { name: "年齢" })).toHaveLength(0);
    expect(screen.getAllByRole("heading", { name: "性別" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("男性").length).toBeGreaterThan(0);
  });

  it("選んだ広告は、取り込み直して並びが変わっても選んだまま", () => {
    const { rerender } = render(<AdBreakdownBars groups={groups} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "x:all:1,2" } });

    rerender(<AdBreakdownBars groups={[...groups].reverse()} />);

    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("x:all:1,2");
    expect(screen.getAllByRole("heading", { name: "性別" }).length).toBeGreaterThan(0);
  });

  it("表示名が同じ「不明」になる値（unknown と 不明）が並んでも、別の行として出す", () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    render(
      <AdBreakdownBars
        groups={[{ ...groups[0], breakdowns: [{ type: "age", items: [item("unknown", 0.5), item("不明", 0.5)] }] }]}
      />,
    );

    const bars = screen.getAllByRole("list")[0];
    expect(within(bars).getAllByText("不明")).toHaveLength(2);
    expect(errors.mock.calls.some((call) => String(call[0]).includes("same key"))).toBe(false);
    errors.mockRestore();
  });

  it(`横棒は${BREAKDOWN_BAR_LIMIT}件までで、残りは「そのほか」にまとめる。表には全部出す`, () => {
    render(<AdBreakdownBars groups={groups} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "x:all:1,2" } });

    const bars = screen.getAllByRole("list").find((list) => within(list).queryByText("そのほか（2件）"))!;
    expect(within(bars).getAllByRole("listitem")).toHaveLength(BREAKDOWN_BAR_LIMIT + 1);
    // 2件 × 10% = 20%
    expect(within(bars).getByText("20%")).toBeInTheDocument();

    const table = screen.getAllByRole("table")[1];
    expect(within(table).getByText(`地域${BREAKDOWN_BAR_LIMIT + 2}`)).toBeInTheDocument();
  });
});
