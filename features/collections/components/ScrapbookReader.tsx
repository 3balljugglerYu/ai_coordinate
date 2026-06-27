"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Share2 } from "lucide-react";
import { CatalogBookView } from "@/features/catalog/components/CatalogBookView";
import type { CatalogPageData } from "@/features/catalog/components/CatalogPage";

/**
 * コレクション完走の「めくれる日記帳(スクラップブック)」没入ビュー。
 * カタログリーダーの CatalogBookView(react-pageflip)をそのまま流用し、
 * 0ページ目の表紙(coverImageUrl)+ 各ページ(縦長9:16の生成画像)を表示する。
 * クレジット(絵師名・Xリンク)は付けない(pages に displayName を渡さない)。
 */
export function ScrapbookReader({
  title,
  coverImageUrl,
  pages,
  isOwner,
}: {
  title: string;
  coverImageUrl: string | null;
  pages: CatalogPageData[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [chromeVisible, setChromeVisible] = useState(true);

  // iOS Safari の rubber band 抑止(CatalogReaderModal と同方針)。
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPaddingBottom = body.style.paddingBottom;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.paddingBottom = "0px";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.paddingBottom = prevBodyPaddingBottom;
    };
  }, []);

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // ユーザーキャンセル等は無視
    }
  };

  const chromeCls = (base: string) =>
    `${base} transition-all duration-300 ${
      chromeVisible
        ? "translate-y-0 opacity-100"
        : "pointer-events-none -translate-y-12 opacity-0"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex h-[100dvh] flex-col select-none bg-slate-50"
      style={{ WebkitTouchCallout: "none" }}
    >
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="閉じる"
        className={chromeCls(
          "absolute left-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-stone-900/70 text-white shadow-md hover:bg-stone-900",
        )}
      >
        <X className="h-5 w-5" />
      </button>

      {isOwner ? (
        <button
          type="button"
          onClick={handleShare}
          className={chromeCls(
            "absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-md hover:bg-amber-600",
          )}
        >
          <Share2 className="h-4 w-4" />
          シェア
        </button>
      ) : (
        <Link
          href="/collections"
          className={chromeCls(
            "absolute right-4 top-4 z-10 inline-flex items-center rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-amber-600",
          )}
        >
          あなたのうちの子でも作れる！
        </Link>
      )}

      <main className="relative flex flex-1 items-start justify-center overflow-hidden px-3 py-4 sm:px-6">
        <CatalogBookView
          campaignTitle={title}
          campaignCoverImageUrl={coverImageUrl}
          pages={pages}
          onChromeVisibilityChange={(visible) => setChromeVisible(visible)}
        />
      </main>
    </div>
  );
}
