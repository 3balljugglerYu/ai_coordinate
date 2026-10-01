"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * 閲覧者をクライアントで確かめる。全員で同じキャッシュを共有するページ・棚
 * (スタイル紹介ページ・ホームのカルーセル)は閲覧者を知らないので、生成シートを
 * 開く前にここで確かめる。
 *
 * 確かめ終えるまでは null(未ログインと区別できない)。終えたら `{ id }`
 * (未ログイン・取得失敗は id: null)。`enabled` が false のあいだは問い合わせない。
 */
export function useResolvedViewer(enabled: boolean): { id: string | null } | null {
  const [viewer, setViewer] = useState<{ id: string | null } | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const {
          data: { user },
        } = await createClient().auth.getUser();
        if (!cancelled) setViewer({ id: user?.id ?? null });
      } catch (error) {
        console.error("Failed to resolve viewer:", error);
        if (!cancelled) setViewer({ id: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return viewer;
}
