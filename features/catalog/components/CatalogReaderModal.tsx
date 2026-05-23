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
 * - 縦スワイプで UI chrome (閉じる × / 申請 CTA) を開閉する (下 = 表示 / 上 = 非表示)。
 *   chrome はスライド + フェードでアニメーションする。タップ・横スワイプでの
 *   ページめくりは CatalogBookView 側で処理する。
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
  //
  // さらに、root layout は body に `pb-16 lg:pb-0` を付与してモバイル下部の
  // NavigationBar 分のスペースを確保しているが、AppShell をバイパスする
  // リーダー画面では NavigationBar が出ないにもかかわらず padding-bottom:64px
  // だけが残り、結果として body が viewport より 64px 高くなる。
  // iOS Safari は overflow:hidden でも body がはみ出していると弾力スクロール
  // (rubber band) が効いてしまうため、表示中だけ padding-bottom を 0 に
  // 上書きして元に戻す。
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

  return (
    <div
      // select-none + WebkitTouchCallout: none で、iOS Safari の画像長押し
      // メニュー (画像を保存… 等) とテキスト選択を抑止する。リーダーは閲覧専用
      // なので選択・保存系の callout は出さない。
      className="fixed inset-0 z-50 flex h-[100dvh] flex-col select-none bg-slate-50"
      style={{ WebkitTouchCallout: "none" }}
    >
      <button
        type="button"
        onClick={() => router.replace(closeRedirectTo)}
        aria-label="閉じる"
        className={`absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-stone-900/70 text-white shadow-md transition-all duration-300 hover:bg-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 ${
          chromeVisible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-12 opacity-0"
        }`}
      >
        <X className="h-5 w-5" />
      </button>

      {/* 左上の申請 CTA。× ボタンと同じ垂直位置 (top-4)。1 行目に申請文言、
          2 行目に注釈を入れた 2 行構成のボタン。 */}
      <Link
        href={`/catalog/submit?campaign=${campaignSlug}`}
        className={`absolute left-4 top-4 z-10 inline-flex flex-col items-center whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 leading-tight text-white shadow-md transition-all duration-300 hover:bg-slate-800 ${
          chromeVisible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-12 opacity-0"
        }`}
      >
        <span className="text-xs font-medium">この企画に作品を申請する</span>
        <span className="text-[10px] text-white/80">※未ログインでもOK</span>
      </Link>

      {/*
        本は viewport 全体に広げ、× / 申請 CTA は z-10 で本の上に重ねる。
        縦スワイプ (下 = 表示 / 上 = 非表示) で chrome を開閉できるため、
        重なっても閲覧の妨げにならない。
      */}
      <main className="relative flex flex-1 items-start justify-center overflow-hidden px-3 py-4 sm:px-6">
        <CatalogBookView
          campaignTitle={campaignTitle}
          campaignHashtag={campaignHashtag}
          campaignDescription={campaignDescription}
          campaignCoverImageUrl={campaignCoverImageUrl}
          pages={pages}
          initialEntryId={initialEntryId}
          onChromeVisibilityChange={(visible) => setChromeVisible(visible)}
        />
      </main>
    </div>
  );
}
