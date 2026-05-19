"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { CatalogBookView } from "./CatalogBookView";
import { type CatalogPageData } from "./CatalogPage";
import { BookCover } from "./BookCover";

interface Props {
  campaignSlug: string;
  campaignTitle: string;
  campaignHashtag?: string | null;
  campaignDescription?: string | null;
  pages: CatalogPageData[];
  /** /catalog/[slug]/p/[entryId] からの直接アクセスでリーダーを開いた状態で表示する */
  initialOpen?: boolean;
  /** 初期表示するエントリー id (initialOpen=true の時に必須) */
  initialEntryId?: string;
}

/**
 * カタログの本めくりリーダーを Dialog (モーダル) として開くトリガー兼コンテナ。
 *
 * - 表紙画像 (BookCover) をクリック可能なボタンとしてレンダリングする
 * - クリックすると Dialog がフルスクリーンで開き、CatalogBookView が表示される
 * - Dialog は NavigationBar / Footer の上にオーバーレイされ、body scroll もロックされる
 *   (Radix Dialog の標準挙動)
 * - X 共有された /p/[entryId] URL でアクセスされた場合は initialOpen=true で
 *   最初から開いた状態にする。閉じると router.replace で /catalog/[slug] に URL を整える
 */
export function CatalogReaderLauncher({
  campaignSlug,
  campaignTitle,
  campaignHashtag,
  campaignDescription,
  pages,
  initialOpen = false,
  initialEntryId,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && initialOpen) {
      // /p/[entryId] から開かれた時は閉じるタイミングで URL を /catalog/[slug] に戻す
      router.replace(`/catalog/${campaignSlug}`);
    }
  };

  const canOpen = pages.length > 0;

  return (
    <>
      {/* 表紙: タップでリーダーを開く */}
      {canOpen ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${campaignTitle} の本を開く`}
          className="group mx-auto block aspect-[3/4] w-full max-w-sm overflow-hidden rounded-md shadow-2xl transition-transform duration-200 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200"
        >
          <BookCover
            title={campaignTitle}
            hashtag={campaignHashtag}
            description={campaignDescription}
            variant="front"
          />
        </button>
      ) : (
        <div className="mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-md opacity-70 shadow-2xl">
          <BookCover
            title={campaignTitle}
            hashtag={campaignHashtag}
            description={campaignDescription}
            variant="front"
          />
        </div>
      )}

      {/* リーダーモーダル: 全画面 / NavigationBar・Footer の上にオーバーレイ */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="left-0 top-0 z-[60] flex h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-slate-50 p-0 [&_[data-slot=dialog-close]]:right-4 [&_[data-slot=dialog-close]]:top-4 [&_[data-slot=dialog-close]]:z-10 [&_[data-slot=dialog-close]]:rounded-full [&_[data-slot=dialog-close]]:bg-stone-900/70 [&_[data-slot=dialog-close]]:p-2 [&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]]:opacity-100 [&_[data-slot=dialog-close]]:hover:bg-stone-900"
        >
          <DialogTitle className="sr-only">{campaignTitle}</DialogTitle>
          <div className="relative flex flex-1 items-center justify-center overflow-hidden px-3 py-3 sm:px-6 sm:py-6">
            <CatalogBookView
              campaignTitle={campaignTitle}
              campaignHashtag={campaignHashtag}
              campaignDescription={campaignDescription}
              pages={pages}
              initialEntryId={initialEntryId}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
