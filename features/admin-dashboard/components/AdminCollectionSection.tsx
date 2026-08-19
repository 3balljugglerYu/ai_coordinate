import type { ReactNode } from "react";

/**
 * 企画レポートのセクション見出し(Phase 5)。
 *
 * これまではカードが11枚フラットに並んでいて、どこから読むかが決まっていなかった。
 * 手集計のレポートで読みやすかったのは配色ではなく**上から読める順序**だったので、
 * 意味のかたまりで区切って番号を振る。
 *
 * 番号は装飾ではなく「読む順序」を表す。サマリー → ファネル → どこで止まったか →
 * 時系列 → シェア → 会期後 → 横並び、の順に読めば、企画で何が起きたかが辿れる。
 */
export function AdminCollectionSection({
  step,
  title,
  description,
  actions,
  children,
}: {
  /** 読む順序。目次としての番号で、内容の種類ではない */
  step: number;
  title: string;
  /** その数字を「どう読むか」。1〜2文で書く */
  description?: string;
  /** CSV 出力など、セクション単位の操作 */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-violet-200/70 bg-white/95 p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="space-y-0.5">
          <h3
            className="flex items-baseline gap-2 text-sm font-semibold text-slate-900"
            style={{
              fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
            }}
          >
            <span className="tabular-nums text-violet-600">
              {String(step).padStart(2, "0")}
            </span>
            {title}
          </h3>
          {description ? (
            <p className="text-[11px] leading-5 text-slate-600">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * 数字の下に置く「読み方」の一文。
 *
 * 手集計のレポートで効いたのは「65.5%」ではなく
 * 「4枚以上進んだ人の82.6%が完走」の方だった。
 * ここに出すのは**比率から機械的に言い換えられる範囲**に限る。
 * それ以上の解釈は所見メモに書く(人が書くことに意味がある)。
 */
export function AdminCollectionReading({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
      {children}
    </p>
  );
}
