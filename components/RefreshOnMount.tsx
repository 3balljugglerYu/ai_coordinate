"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * マウント時に router.refresh() を呼び、サーバーから最新データを取得する。
 *
 * ペルコイン残高など、クライアント側の Router Cache に古いデータが残っている場合、
 * 初回遷移時はキャッシュされた RSC ペイロードが表示され、残高が更新されない問題がある。
 * 本コンポーネントを配置することで、ページ表示時に必ず最新データを取得する。
 */
export function RefreshOnMount() {
  const router = useRouter();

  useEffect(() => {
    router.refresh();
  }, [router]);

  return null;
}
