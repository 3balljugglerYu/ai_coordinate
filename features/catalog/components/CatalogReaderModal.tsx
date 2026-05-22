"use client";

import { useEffect, useState } from "react";
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
  /** front cover に表示するサムネイル画像 URL (任意。カタログ一覧と同じ画像) */
  campaignCoverImageUrl?: string | null;
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
 * - 本の中央タップで UI chrome (閉じる × / 申請 CTA) を開閉できる (Kobo 風)。
 *   左右タップ・スワイプでのページめくりは CatalogBookView 側で処理する。
 */
export function CatalogReaderModal({
  campaignSlug,
  campaignTitle,
  campaignHashtag,
  campaignDescription,
  campaignCoverImageUrl,
  pages,
  initialEntryId,
  closeRedirectTo,
}: Props) {
  const router = useRouter();

  // UI chrome (閉じる × / 申請 CTA) の表示状態。本の中央タップでトグルする。
  const [chromeVisible, setChromeVisible] = useState(true);

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

  // リーダー表示中はドキュメントの縦スクロールをロックする。
  // body だけでなく html (documentElement) も対象にしないと、ブラウザの
  // ツールバー伸縮分などで生じる余剰高さによりページがスクロールしてしまう。
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-slate-50">
      <button
        type="button"
        onClick={() => router.replace(closeRedirectTo)}
        aria-label="閉じる"
        className={`absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-stone-900/70 text-white shadow-md transition-all duration-200 hover:bg-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 ${
          chromeVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <X className="h-5 w-5" />
      </button>

      {/* 左上の申請 CTA。× ボタンと同じ垂直位置 (top-4) に揃え、注釈をボタン右側に並べる。 */}
      <div
        className={`absolute left-4 top-4 z-10 flex items-center gap-2 transition-opacity duration-300 ${
          chromeVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <Link
          href={`/catalog/submit?campaign=${campaignSlug}`}
          className="inline-flex h-9 items-center whitespace-nowrap rounded-md bg-slate-900 px-3 text-xs font-medium text-white shadow-md transition-colors hover:bg-slate-800"
        >
          この企画に作品を申請する
        </Link>
        <span
          className="whitespace-nowrap text-[10px] font-medium text-white/90"
          style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
        >
          ※未ログインでもOK
        </span>
      </div>

      {/*
        本は viewport 全体に広げ、× / 申請 CTA は z-10 で本の上に重ねる。
        中央タップで chrome を開閉できるため、重なっても閲覧の妨げにならない。
      */}
      <main className="relative flex flex-1 items-start justify-center overflow-hidden px-3 py-4 sm:px-6">
        <CatalogBookView
          campaignTitle={campaignTitle}
          campaignHashtag={campaignHashtag}
          campaignDescription={campaignDescription}
          campaignCoverImageUrl={campaignCoverImageUrl}
          pages={pages}
          initialEntryId={initialEntryId}
          onCenterTap={() => setChromeVisible((v) => !v)}
        />
      </main>
    </div>
  );
}
