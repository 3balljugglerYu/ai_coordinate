"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Share2, Maximize2, Minimize2, ChevronUp } from "lucide-react";
import { CatalogBookView } from "@/features/catalog/components/CatalogBookView";
import type { CatalogPageData } from "@/features/catalog/components/CatalogPage";
import { CompletionFeedPostButton } from "@/features/collections/components/CompletionFeedPostButton";
import { CompletionRewardPanel } from "@/features/collections/components/CompletionRewardPanel";
import {
  hasSeenSwipeHint,
  markSwipeHintSeen,
} from "@/features/collections/lib/scrapbook-swipe-hint-seen";

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
  completionId,
  rewardGranted = 0,
}: {
  title: string;
  coverImageUrl: string | null;
  pages: CatalogPageData[];
  isOwner: boolean;
  /** 完走(collection_completions.id = token)。所有者にホーム投稿ボタンを出すのに使う。 */
  completionId?: string | null;
  /**
   * 完走報酬の実付与額(?reward= から。所有者のみ・表示専用)。
   * >0 のとき開幕にカウントアップ演出を重ねる(着地後は自動で消える)。
   */
  rewardGranted?: number;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 「上スワイプでUIを隠せる」ヒントをまだ見せていないか(localStorage 由来、SSRは常に false)。
  // canFullscreen と同じ理由(setState-in-effect 回避)で useSyncExternalStore を使う。
  const swipeHintEligible = useSyncExternalStore(
    () => () => {},
    () => !hasSeenSwipeHint(),
    () => false,
  );
  const [swipeHintDismissed, setSwipeHintDismissed] = useState(false);
  const showSwipeHint = swipeHintEligible && !swipeHintDismissed;
  // Fullscreen API は iOS Safari が要素に非対応(動画のみ)。対応環境だけボタンを出す。
  // SSR セーフに client 値を取るため useSyncExternalStore を使う(setState-in-effect 回避)。
  const canFullscreen = useSyncExternalStore(
    () => () => {},
    () => {
      const d = document as Document & { webkitFullscreenEnabled?: boolean };
      return Boolean(d.fullscreenEnabled ?? d.webkitFullscreenEnabled);
    },
    () => false,
  );

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

  // 初回(未読)のみ、本を開いた瞬間に見せたヒントの既読を記録する。
  // ジェスチャーのみの操作で発見性が低いため一度だけ案内する。実際に上スワイプされる
  // (chromeVisible=false)まで表示し続け、そこで消す(onChromeVisibilityChange 側で処理)。
  useEffect(() => {
    if (!swipeHintEligible) return;
    markSwipeHintSeen();
  }, [swipeHintEligible]);

  // 全画面状態の同期(Esc やブラウザ UI での解除にも追従)。
  useEffect(() => {
    const onChange = () => {
      const d = document as Document & { webkitFullscreenElement?: Element };
      setIsFullscreen(Boolean(d.fullscreenElement ?? d.webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  const handleClose = () => {
    // 直リンク(履歴なし)で来たゲストは back() が no-op になるため /style へ
    // (「自分でも作ってみる」導線=コンバージョン優先)。アプリ内遷移時は従来どおり戻る。
    if (typeof window !== "undefined" && window.history.length <= 1) {
      router.push("/style");
    } else {
      router.back();
    }
  };

  const handleToggleFullscreen = async () => {
    try {
      const d = document as Document & {
        webkitFullscreenElement?: Element;
        webkitExitFullscreen?: () => Promise<void> | void;
      };
      const active = d.fullscreenElement ?? d.webkitFullscreenElement;
      if (!active) {
        const el = containerRef.current as
          | (HTMLDivElement & {
              webkitRequestFullscreen?: () => Promise<void> | void;
            })
          | null;
        if (!el) return;
        await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      } else {
        await (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
      }
    } catch {
      // 失敗(ユーザー操作不足/非対応)は無視
    }
  };

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
      ref={containerRef}
      className="fixed inset-0 z-50 flex h-[100dvh] flex-col select-none bg-slate-50"
      style={{ WebkitTouchCallout: "none" }}
    >
      <button
        type="button"
        onClick={handleClose}
        aria-label="閉じる"
        className={chromeCls(
          "absolute left-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-stone-900/70 text-white shadow-md hover:bg-stone-900",
        )}
      >
        <X className="h-5 w-5" />
      </button>

      {/* 右上: [全画面表示(対応環境のみ)] [シェア / CTA] */}
      <div
        className={chromeCls(
          "absolute right-4 top-4 z-10 flex items-center gap-2",
        )}
      >
        {canFullscreen ? (
          <button
            type="button"
            onClick={handleToggleFullscreen}
            aria-label={isFullscreen ? "全画面表示を解除" : "全画面表示"}
            className="inline-flex items-center gap-1.5 rounded-full bg-stone-900/70 px-3 py-2 text-sm font-bold text-white shadow-md hover:bg-stone-900"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
            {isFullscreen ? "全画面解除" : "全画面表示"}
          </button>
        ) : null}

        {isOwner ? (
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-md hover:bg-amber-600"
          >
            <Share2 className="h-4 w-4" />
            シェア
          </button>
        ) : (
          <Link
            href="/style"
            className="inline-flex items-center rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-amber-600"
          >
            あなたのうちの子でも作れる！
          </Link>
        )}
      </div>

      <main className="relative flex flex-1 items-start justify-center overflow-hidden px-3 py-4 sm:px-6">
        <CatalogBookView
          campaignTitle={title}
          campaignCoverImageUrl={coverImageUrl}
          pages={pages}
          isScrapbook
          onChromeVisibilityChange={(visible) => {
            setChromeVisible(visible);
            // 上スワイプ(=chrome非表示化)が実際に行われたら、ヒントの役目は
            // 終わったので自動消滅を待たず即座に消す。
            if (!visible) setSwipeHintDismissed(true);
          }}
        />
      </main>

      {showSwipeHint ? (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          aria-hidden="true"
        >
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-stone-900/70 px-6 py-5 text-white shadow-lg">
            <ChevronUp className="h-8 w-8 animate-bounce" />
            <p className="text-sm font-bold">↑ 上スワイプでUIを隠せます</p>
          </div>
        </div>
      ) : null}

      {/* 完走報酬の獲得演出(完走直後の遷移時のみ)。着地後は自動で消え、没入を妨げない */}
      {rewardGranted > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center">
          <CompletionRewardPanel
            amount={rewardGranted}
            delayMs={900}
            autoDismissMs={3200}
          />
        </div>
      ) : null}

      {/* 所有者向け: ホームフィードへの投稿(没入ページにも常設)。chrome と同期して出し入れ。 */}
      {isOwner && completionId ? (
        <div
          className={
            "absolute bottom-5 left-1/2 z-10 -translate-x-1/2 transition-opacity duration-300 " +
            (chromeVisible ? "opacity-100" : "pointer-events-none opacity-0")
          }
        >
          <CompletionFeedPostButton
            completionId={completionId}
            displayName={title}
            variant="chrome"
          />
        </div>
      ) : null}
    </div>
  );
}
