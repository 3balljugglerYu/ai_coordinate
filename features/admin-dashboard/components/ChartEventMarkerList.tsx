import { formatJstDateLabel } from "../lib/dashboard-range";
import type { ChartEventMarker } from "../lib/chart-event-markers";

/** グラフの下に出す、出来事の印の番号と名前の一覧。印が無ければ何も出さない。 */
export function ChartEventMarkerList({
  markers,
  className,
}: {
  markers: ChartEventMarker[];
  className?: string;
}) {
  if (markers.length === 0) return null;
  return (
    <ol className={`space-y-0.5 text-xs text-slate-600 ${className ?? ""}`}>
      {markers.map((marker) => (
        <li key={marker.day}>
          <span className="font-bold text-slate-700">{marker.number}.</span>{" "}
          {formatJstDateLabel(marker.day)} {marker.names.join("・")}
        </li>
      ))}
    </ol>
  );
}
