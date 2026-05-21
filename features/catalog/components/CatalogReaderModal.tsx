"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { CatalogBookView } from "./CatalogBookView";
import { type CatalogPageData } from "./CatalogPage";

interface Props {
  /** 申請フォームへのリンクを組み立てるための slug */
  campaignSlug: string;
  campaignTitle: string;
  campaignHashtag?: string | null;
  campaignDescription?: string | null;
  /** 表示するエントリー (1 件以上であること) */
  pages: CatalogPageData[];
  /** 初期表示するエントリー id (省略時は先頭) */
  initialEntryId?: string;
  /** 閉じる × ボタン押下時の遷移先 */
  closeRedirectTo: string;
}

/**
 * カタログのフルスクリーン本めくりリーダー。
 *
 * 設計メモ:
 * - 以前は Radix Dialog をベースに `useState(true)` で auto-open していたが、
 *   2 回目以降の navigation で React/Router キャッシュと噛み合って open=false 状態で
 *   再マウントされる不具合があったため、Dialog を撤廃。
 * - 代わりに `position: fixed inset-0` の単純な overlay div として常時表示する。
 * - AppShell 側で /catalog/[slug] 配下を `shouldBypassAppShell` にして Header / Sidebar /
 *   NavigationBar / Footer を表示させないため、この overlay が viewport を全て覆う。
 * - 閉じる × と Esc キーで `closeRedirectTo` に `router.replace` する。
 */
export function CatalogReaderModal({
  campaignSlug,
  campaignTitle,
  campaignHashtag,
  campaignDescription,
  pages,
  initialEntryId,
  closeRedirectTo,
}: Props) {
  const router = useRouter();

  // Esc キーで閉じる
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        router.replace(closeRedirectTo);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router, closeRedirectTo]);

  // body の縦スクロールをロック (AppShell バイパス時に念のため)
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-slate-50">
      <button
        type="button"
        onClick={() => router.replace(closeRedirectTo)}
        aria-label="閉じる"
        className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-stone-900/70 text-white shadow-md transition-colors hover:bg-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
      >
        <X className="h-5 w-5" />
      </button>

      {/* 左上の申請 CTA。× ボタンと同じ垂直位置 (top-4) に揃え、注釈をボタン右側に並べる。 */}
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
        <Link
          href={`/catalog/submit?campaign=${campaignSlug}`}
          className="inline-flex h-9 items-center whitespace-nowrap rounded-md bg-slate-900 px-3 text-xs font-medium text-white shadow-md transition-colors hover:bg-slate-800"
        >
          この企画に作品を申請する
        </Link>
        <span className="whitespace-nowrap text-[10px] text-slate-500">
          ※未ログインでもOK
        </span>
      </div>

      {/*
        上部スペーサ。× / 申請ボタン (h-9 / 36px) の上下に 16px の余白を確保する。
        16 (top-4) + 36 + 16 (gap to book) = 68px。
      */}
      <div aria-hidden className="h-[68px] shrink-0" />

      <main className="relative flex flex-1 items-start justify-center overflow-hidden px-3 pb-4 sm:px-6">
        <CatalogBookView
          campaignTitle={campaignTitle}
          campaignHashtag={campaignHashtag}
          campaignDescription={campaignDescription}
          pages={pages}
          initialEntryId={initialEntryId}
        />
      </main>
    </div>
  );
}
