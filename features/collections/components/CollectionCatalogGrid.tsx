import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type {
  CollectionCatalogAvailability,
  CollectionCatalogEntry,
  CollectionCatalogState,
} from "@/features/collections/lib/collection-catalog-view";

/**
 * 図鑑カードのタップ先。専用ガイドがあるシリーズはそこへ、無ければ集める導線(/style)へ。
 */
const GUIDE_HREF_BY_KEY: Record<string, string> = {
  collectible_wafer_sticker_god_6p: "/collections/wafer",
};

function hrefForEntry(entry: CollectionCatalogEntry): string {
  return GUIDE_HREF_BY_KEY[entry.key] ?? "/style";
}

function StateBadge({
  state,
  availability,
  remaining,
  threshold,
  locale,
}: {
  state: CollectionCatalogState;
  availability: CollectionCatalogAvailability;
  remaining: number;
  threshold: number;
  locale: "ja" | "en";
}) {
  // 完成は実績としていつでも優先表示。
  if (state === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-white">
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        {locale === "en" ? "Complete" : "コンプ済み"}
      </span>
    );
  }
  // 期間外: 集めようと誘わず、終了/近日を正直に出す。
  if (availability === "ended") {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-bold text-gray-600">
        {locale === "en" ? "Ended" : "終了・また登場"}
      </span>
    );
  }
  if (availability === "upcoming") {
    return (
      <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">
        {locale === "en" ? "Coming soon" : "近日"}
      </span>
    );
  }
  if (state === "in_progress") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
        {locale === "en" ? `${remaining} left` : `あと${remaining}種`}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-500">
      {locale === "en" ? `${threshold} to collect` : `全${threshold}種`}
    </span>
  );
}

export function CollectionCatalogGrid({
  entries,
  locale,
}: {
  entries: CollectionCatalogEntry[];
  locale: "ja" | "en";
}) {
  if (entries.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-gray-500">
        {locale === "en"
          ? "No collections available yet. Check back soon!"
          : "いまは公開中のコレクションがありません。お楽しみに！"}
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {entries.map((entry) => {
        const name = locale === "en" ? entry.displayNameEn : entry.displayNameJa;
        const ratio =
          entry.completionThreshold > 0
            ? Math.min(1, entry.uniqueOutfitCount / entry.completionThreshold)
            : 0;
        const dimmed =
          entry.availability === "ended" || entry.availability === "upcoming";
        const showProgressBar =
          entry.state === "in_progress" && entry.availability === "available";
        const subLabel =
          entry.state === "completed"
            ? locale === "en"
              ? "Completed"
              : "コンプリート済み"
            : entry.availability === "ended"
              ? locale === "en"
                ? "Coming back soon"
                : "また登場します"
              : entry.availability === "upcoming"
                ? locale === "en"
                  ? "Coming soon"
                  : "近日公開"
                : locale === "en"
                  ? `Collect all ${entry.completionThreshold}`
                  : `${entry.completionThreshold}種あつめよう`;
        return (
          <li key={entry.key}>
            <Link
              href={hrefForEntry(entry)}
              className="block overflow-hidden rounded-2xl border border-gray-200 bg-white transition-colors hover:bg-gray-50"
            >
              <div className="relative aspect-square bg-gray-100">
                {entry.imageUrl ? (
                  <Image
                    src={entry.imageUrl}
                    alt={name}
                    fill
                    sizes="(max-width: 640px) 50vw, 200px"
                    className={`object-cover ${dimmed ? "opacity-60 grayscale" : "opacity-100"}`}
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-3xl font-bold text-gray-300"
                    aria-hidden="true"
                  >
                    ?
                  </div>
                )}
                <div className="absolute left-1.5 top-1.5">
                  <StateBadge
                    state={entry.state}
                    availability={entry.availability}
                    remaining={entry.remaining}
                    threshold={entry.completionThreshold}
                    locale={locale}
                  />
                </div>
              </div>
              <div className="p-2.5">
                <p
                  className="truncate text-sm font-semibold text-gray-800"
                  title={name}
                >
                  {name}
                </p>
                {showProgressBar ? (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: `${Math.round(ratio * 100)}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] font-medium tabular-nums text-gray-500">
                      {entry.uniqueOutfitCount}/{entry.completionThreshold}
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">{subLabel}</p>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
