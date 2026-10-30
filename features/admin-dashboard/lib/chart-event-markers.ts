/**
 * 日ごとのグラフに出す「出来事の印」(admin_timeline_events)を、縦線1本ずつにまとめる(純関数)。
 *
 * 同じ日の出来事は1本の線にまとめ、日付の古い順に 1 から番号を付ける。
 * 線には番号だけを出し、名前はグラフの下に番号つきで並べる(近い日どうしで名前が重なるため)。
 * グラフに無い日の出来事は出さない。
 */

export interface ChartEventMarker {
  /** YYYY-MM-DD */
  day: string;
  names: string[];
  number: number;
}

export function buildChartEventMarkers(
  events: ReadonlyArray<{ eventDate: string; title: string }>,
  days: ReadonlySet<string>,
): ChartEventMarker[] {
  const namesByDay = new Map<string, string[]>();
  for (const event of [...events].sort((a, b) => a.eventDate.localeCompare(b.eventDate))) {
    if (!days.has(event.eventDate)) continue;
    namesByDay.set(event.eventDate, [...(namesByDay.get(event.eventDate) ?? []), event.title]);
  }
  return Array.from(namesByDay.entries()).map(([day, names], index) => ({
    day,
    names,
    number: index + 1,
  }));
}
