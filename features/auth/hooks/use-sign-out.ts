"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/use-toast";
import { signOut } from "@/features/auth/lib/auth-client";
import { navigateFullPage } from "@/lib/full-page-navigation";

/**
 * ログアウト操作(ヘッダー・サイドバー・マイページ・退会復帰画面)。
 *
 * - 成功したら destination へ全画面遷移する。サーバー経由でログアウトした場合、
 *   このタブの画面(ヘッダー等)はまだログイン中の表示のままなので、読み込み直して揃える
 * - 失敗したらトーストで知らせる。以前は console に出すだけで、押しても
 *   何も起きないように見えた(2026-09-27)
 *
 * 返す Promise は、結果の処理(遷移またはトースト)が済んでから解決する。
 */
export function useSignOut() {
  const navT = useTranslations("nav");
  const { toast } = useToast();

  return useCallback(
    async (destination: string): Promise<void> => {
      try {
        await signOut();
      } catch (error) {
        console.error("Sign out error:", error);
        toast({ variant: "destructive", title: navT("logoutFailed") });
        return;
      }
      navigateFullPage(destination);
    },
    [navT, toast]
  );
}
