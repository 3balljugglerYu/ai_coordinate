import { getTranslations } from "next-intl/server";
import { getTotalStyleGenerateCount } from "@/features/style/lib/style-usage-stats";

/**
 * /style 上部の「これまでに生成された枚数」バナー。
 *
 * 件数は時間で変わる動的データ(use cache)なので、静的ヘッダ(タイトル)を
 * ブロックしないよう page.tsx 側で <Suspense> に包んでストリーミングする。
 * 件数が無い/取得失敗時は何も表示しない。
 */
export async function StyleTotalGenerationCount() {
  const t = await getTranslations("style");
  const totalGenerationCount = await getTotalStyleGenerateCount().catch(
    () => null
  );

  if (typeof totalGenerationCount !== "number" || totalGenerationCount <= 0) {
    return null;
  }

  return (
    <div
      data-testid="style-total-generation-count"
      className="relative overflow-hidden rounded-xl border border-[#B7BDC6] bg-[linear-gradient(135deg,#F9FBFF_0%,#E6F0FF_20%,#E5E4E2_45%,#CBD6E3_70%,#FFFFFF_100%)] px-4 py-3 text-center shadow-[0_0_12px_rgba(216,235,255,0.8),0_0_28px_rgba(216,235,255,0.45)] transition-shadow hover:shadow-[0_0_16px_rgba(216,235,255,0.9),0_0_32px_rgba(216,235,255,0.6)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent,45%,#D8EBFF,55%,transparent)] bg-[length:250%_100%] animate-shine opacity-60 mix-blend-overlay" />
      <span className="relative z-10 block text-sm font-semibold text-slate-900">
        {t("totalGenerationCount", {
          count: totalGenerationCount.toLocaleString(),
        })}
      </span>
    </div>
  );
}
