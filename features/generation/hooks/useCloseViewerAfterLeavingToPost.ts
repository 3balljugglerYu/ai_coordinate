"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * 拡大表示(ImageModal)から投稿用ページへ移ったあと、この画面が隠れたら拡大表示を閉じる。
 *
 * ## なぜ要るのか(2026-10-15 ユーザー報告「投稿しても +20ペルコインの演出が出ない」)
 *
 * 拡大表示の「＋ 投稿」は、移るあいだに下の一覧が一瞬見えないよう、拡大表示を開いたまま
 * 投稿用ページへ移る。ところが Next.js(cacheComponents)は、戻ったときのために前の画面を
 * 消さずに隠して残す。投稿して戻ると、拡大表示が開いたまま現れ、その重なり順(9999)が
 * 投稿の演出(PostBonusModal・50)とトーストを覆い隠す。さらに「×」を押すと、同じ操作が
 * 演出の外側を押したことになり、演出ごと閉じてしまう。利用者には演出が一度も見えない。
 *
 * そこで、投稿用ページへ移ると決めた印を付けておき、画面が隠れた(または外れた)ときの
 * 片付けで拡大表示を閉じる。隠れたあとに閉じるので、移るあいだのちらつきは起きない。
 *
 * @param setSelectedIndex 拡大表示の開閉を持つ state の setter(null で閉じる)。
 * @returns 投稿用ページへ移る直前に呼ぶ関数。
 */
export function useCloseViewerAfterLeavingToPost(
  setSelectedIndex: (index: number | null) => void,
): () => void {
  const leavingToPostRef = useRef(false);

  useEffect(() => {
    // 画面が隠れた・外れたときに動く(開いているあいだは何もしない)
    return () => {
      if (!leavingToPostRef.current) return;
      leavingToPostRef.current = false;
      setSelectedIndex(null);
    };
  }, [setSelectedIndex]);

  return useCallback(() => {
    leavingToPostRef.current = true;
  }, []);
}
