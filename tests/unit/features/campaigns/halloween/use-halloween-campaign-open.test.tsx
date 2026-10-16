/**
 * みんなのカタログの「🎃 #うちの子のベストショット」のタブを出すか(2026-10-16 ユーザー指示)。
 *
 * - 出すのは期間中(10/16 20:00 〜 11/1 0:00 の手前)・日本語の画面だけ
 * - サーバーで描くときは出さない(ハイドレーションで食い違わないように)
 *
 * jest.setup.js で全体は「期間外」に固定しているので、ここでは本物を読み込む。
 */

import React from "react";
import { renderToString } from "react-dom/server.node";
import { render, screen } from "@testing-library/react";

const mockLocale = jest.fn<string, []>(() => "ja");
jest.mock("next-intl", () => ({
  useLocale: () => mockLocale(),
}));

const { useHalloweenCampaignOpen } = jest.requireActual<
  typeof import("@/features/campaigns/halloween/hooks/useHalloweenCampaignOpen")
>("@/features/campaigns/halloween/hooks/useHalloweenCampaignOpen");

function Probe() {
  return <span data-testid="open">{useHalloweenCampaignOpen() ? "open" : "closed"}</span>;
}

let nowSpy: jest.SpyInstance<number, []>;

beforeEach(() => {
  mockLocale.mockReturnValue("ja");
  nowSpy = jest.spyOn(Date, "now");
});

afterEach(() => {
  nowSpy.mockRestore();
});

describe("useHalloweenCampaignOpen", () => {
  test.each([
    ["10/16 19:59:59", "2026-10-16T19:59:59+09:00", "closed"],
    ["10/16 20:00:00(始まり)", "2026-10-16T20:00:00+09:00", "open"],
    ["10/31 23:59:59(最後の1秒)", "2026-10-31T23:59:59+09:00", "open"],
    ["11/1 0:00:00(終わり)", "2026-11-01T00:00:00+09:00", "closed"],
  ])("%s → %s", (_label, iso, expected) => {
    nowSpy.mockReturnValue(Date.parse(iso));
    render(<Probe />);
    expect(screen.getByTestId("open").textContent).toBe(expected);
  });

  test("日本語以外の画面では、期間中でも出さない(企画は日本国内向け)", () => {
    nowSpy.mockReturnValue(Date.parse("2026-10-20T12:00:00+09:00"));
    mockLocale.mockReturnValue("en");
    render(<Probe />);
    expect(screen.getByTestId("open").textContent).toBe("closed");
  });

  test("⭐サーバーで描くときは、期間中でも出さない", () => {
    nowSpy.mockReturnValue(Date.parse("2026-10-20T12:00:00+09:00"));
    expect(renderToString(<Probe />)).toContain("closed");
  });
});
