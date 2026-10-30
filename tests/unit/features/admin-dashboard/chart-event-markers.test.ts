/**
 * 日ごとのグラフの「出来事の印」をまとめる（ペルコインの日ごとと、広告の日ごとで共通）。
 *
 * ここで守ること:
 *  - 同じ日の出来事は1本の線にまとめ、日付の古い順に1から番号を付ける
 *  - グラフに無い日の出来事は出さない
 */

import { buildChartEventMarkers } from "@/features/admin-dashboard/lib/chart-event-markers";

describe("buildChartEventMarkers", () => {
  it("同じ日はまとめ、古い順に番号を付け、グラフに無い日は出さない", () => {
    const markers = buildChartEventMarkers(
      [
        { eventDate: "2026-10-26", title: "広告を出し直し" },
        { eventDate: "2026-10-16", title: "Meta 広告を開始" },
        { eventDate: "2026-10-16", title: "企画を開始" },
        { eventDate: "2026-09-01", title: "グラフの前" },
      ],
      new Set(["2026-10-16", "2026-10-26"]),
    );

    expect(markers).toEqual([
      { day: "2026-10-16", names: ["Meta 広告を開始", "企画を開始"], number: 1 },
      { day: "2026-10-26", names: ["広告を出し直し"], number: 2 },
    ]);
  });
});
