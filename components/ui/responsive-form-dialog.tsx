"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Drawer } from "vaul";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * 入力フォームを載せるモーダル。モバイルはボトムシート、PC は従来のダイアログ。
 *
 * モバイルで `position: fixed` の中央モーダルを使うと、仮想キーボードが出たときに
 * Chrome が visual viewport をパンして入力欄を見せようとする。fixed 要素は
 * レイアウトビューポートに固定されているため、画面上では滑って見える（#617 で
 * dvh・scroll-behavior 側を直してもこれだけは残った）。
 *
 * vaul の Drawer は visualViewport を監視してシート自身をキーボードに追従させる
 * （`repositionInputs` が既定で true）。加えて下端が固定なので、高さが変わっても
 * 位置が動かない。`features/generation/components/ImageSourcePicker` と同じ
 * 「モバイル=Drawer / PC=Dialog」の出し分けを踏襲している。
 */
const MOBILE_QUERY = "(max-width: 767px)";

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return isMobile;
}

interface ResponsiveFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** PC 版 DialogContent に足すクラス（幅の指定など）。 */
  desktopClassName?: string;
  children: ReactNode;
}

export function ResponsiveFormDialog({
  open,
  onOpenChange,
  title,
  desktopClassName,
  children,
}: ResponsiveFormDialogProps) {
  const isMobile = useIsMobileViewport();

  return (
    <>
      <Drawer.Root open={open && isMobile} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Drawer.Content className="bg-background fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl outline-none">
            <div className="flex-shrink-0">
              <Drawer.Handle className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-gray-300" />
              <div className="px-4 pt-3 pb-2">
                <Drawer.Title className="text-base font-semibold">
                  {title}
                </Drawer.Title>
                <Drawer.Description className="sr-only">
                  {title}
                </Drawer.Description>
              </div>
            </div>
            {/* 下端は iOS のホームインジケータ分を確保する。 */}
            <div className="flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {children}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <Dialog open={open && !isMobile} onOpenChange={onOpenChange}>
        <DialogContent
          // 説明文を持たないフォームなので Radix の Description 警告は明示的に抑える
          // (features/posts/components/ReplyPanel.tsx と同じ扱い)。
          aria-describedby={undefined}
          className={cn(
            "w-[calc(100vw-2rem)] overflow-y-auto sm:max-h-[90vh]",
            desktopClassName,
          )}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    </>
  );
}
