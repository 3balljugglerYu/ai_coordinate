/**
 * 管理画面の横棒。長さは value / max。0 でない値は細くても見えるようにし、
 * max を超える値は枠の中で切る(枠からはみ出さない)。
 */
export function AdminBar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 1.5 : 0) : 0;
  return (
    <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100">
      <div className="h-full rounded" style={{ width: `${width}%`, backgroundColor: color }} />
    </div>
  );
}
