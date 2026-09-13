"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * 投稿フォーム（`/posts/new/[imageId]`）へ遷移し、その間の待ち状態を返す。
 *
 * 押したことが分からない、という指摘への対応。遷移はサーバーの往復を挟むので、
 * 押してから画面が変わるまでに間がある。その間ボタンを「処理中」に見せる。
 *
 * ⭐ ボタンは native の `disabled` にしない。フォーカスされている要素を
 * disabled にするとフォーカスが body に落ちてしまい、支援技術の利用者が
 * 現在位置を見失う。代わりに `aria-disabled` + `aria-busy` を付け、
 * **ここで早期 return** して二重発火を止める。`aria-disabled` だけでは
 * クリックは止まらないので、その組み合わせが必須。
 */
export function usePostPageNavigation() {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  /*
    ⭐ ガードに `isNavigating` は使えない。`useTransition` の pending は
    次のレンダーまで立たないので、同じティックでの連打を素通りさせてしまう
    （実際にテストで3回とも通った）。ref なら同期的に効く。
  */
  const lockedRef = useRef(false);
  const sawPendingRef = useRef(false);

  useEffect(() => {
    if (isNavigating) {
      sawPendingRef.current = true;
      return;
    }
    /*
      遷移が「始まって終わった」ときだけロックを解く。押した直後はまだ
      pending が立っていないので、そこで解くとガードが効かなくなる。
      遷移に成功すればこの画面ごと外れるが、失敗して戻ってきたときに
      ボタンが押せないままにならないようにする。
    */
    if (sawPendingRef.current) {
      sawPendingRef.current = false;
      lockedRef.current = false;
    }
  }, [isNavigating]);

  const openPostPage = useCallback(
    (imageId: string) => {
      if (lockedRef.current) return;
      lockedRef.current = true;
      startTransition(() => {
        router.push(`/posts/new/${imageId}`);
      });
    },
    [router]
  );

  return { isNavigating, openPostPage };
}
