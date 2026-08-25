"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UsablePromptShowcaseItem } from "../lib/get-usable-prompt-showcase";

/**
 * 「使えるプロンプト」のサムネイルを押したときの確認。
 *
 * ## なぜ確認を挟むのか
 *
 * ここは**読み物の途中**にある。押した先は投稿の詳細で、戻ってこないと
 * 続きが読めない。読んでいる最中に黙って別のページへ飛ばされると、
 * どこまで読んだか分からなくなる。
 *
 * 「押したら移動する」と一言あるだけで、押すかどうかを自分で決められる。
 *
 * ## 通常の Dialog を使う理由
 *
 * AlertDialog は「引き返せない操作」のためのもので、枠外を押しても
 * 閉じない。ここは眺めて戻るだけなので、枠外・Esc・× で閉じられる方が
 * 軽い(`StyleTryOnConfirmDialog` と同じ判断)。
 */
export function ShowcaseLeaveDialog({
  item,
  onOpenChange,
}: {
  /** 確認中の作品。null なら閉じる。 */
  item: UsablePromptShowcaseItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-center">
            この作品のページへ移動しますか？
          </DialogTitle>
          {/* Radix の a11y 要件(aria-describedby)。見出しで足りるので sr-only。 */}
          <DialogDescription className="sr-only">
            投稿の詳細ページへ移動します。移動しない場合はこのまま閉じてください。
          </DialogDescription>
        </DialogHeader>

        {item ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="relative w-full max-w-[220px] overflow-hidden rounded-2xl bg-sky-50 [aspect-ratio:3/4]">
              <Image
                src={item.thumbnailUrl}
                alt={`${item.authorName}さんの作品`}
                fill
                sizes="220px"
                className="object-cover"
              />
            </div>
            <p className="text-base font-bold text-slate-900">
              {item.authorName}さんの作品
            </p>
            <p className="text-center text-xs leading-relaxed text-slate-500">
              このページを離れます。
              <br />
              戻るときはブラウザの「戻る」で戻れます。
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button
            onClick={() => {
              if (!item) return;
              /*
                ⭐ 送り出す前に閉じること。

                クライアント遷移では、戻ったときにこのページの状態が
                そのまま復元される。開いたままにすると、**戻ってきた瞬間に
                モーダルが被さって**、読んでいた場所が塞がれる
                (実機で確認して見つけた)。
              */
              onOpenChange(false);
              router.push(`/posts/${encodeURIComponent(item.postId)}`);
            }}
          >
            作品を見る
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            このページに戻る
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
