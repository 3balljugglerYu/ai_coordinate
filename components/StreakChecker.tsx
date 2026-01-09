"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { checkStreakBonus } from "@/features/credits/lib/api";
import { getCurrentUser } from "@/features/auth/lib/auth-client";

/**
 * ストリーク（連続ログイン）特典チェックコンポーネント
 * 認証が必要なページで使用し、マウント時にストリーク特典をチェックします
 */
export function StreakChecker() {
  const { toast } = useToast();

  useEffect(() => {
    const checkBonus = async () => {
      // 認証状態をチェック（未認証の場合は静かに終了）
      const user = await getCurrentUser();
      if (!user) {
        return;
      }

      // セッション内で既にチェック済みか確認
      const hasChecked = sessionStorage.getItem("streakBonusChecked");
      if (hasChecked) {
        return;
      }
      // チェック済みフラグを立てる
      sessionStorage.setItem("streakBonusChecked", "true");

      try {
        const data = await checkStreakBonus();

        // 特典が付与された場合、Toast通知を表示
        if (data.bonus_granted && data.bonus_granted > 0) {
          const streakDays = data.streak_days;
          const description =
            streakDays && streakDays > 0
              ? `${streakDays}日連続ログインで${data.bonus_granted}ペルコインを獲得しました！`
              : `ログインボーナスとして${data.bonus_granted}ペルコインを獲得しました！`;

          toast({
            title: "連続ログイン特典ボーナス！",
            description,
            variant: "default",
          });
        }
      } catch (error) {
        // エラーが発生してもユーザー体験を損なわない（静かに失敗）
        // TODO: エラー監視が必要な場合は、Sentryなどの専用サービスを利用することを検討してください
        // デバッグ用: 開発環境でのみエラーをログ出力
        if (process.env.NODE_ENV === "development") {
          console.error("[StreakChecker] Error:", error);
        }
        // エラー発生時は次回ページ遷移時に再チェックできるようフラグを削除
        sessionStorage.removeItem("streakBonusChecked");
      }
    };

    checkBonus();
  }, [toast]);

  // このコンポーネントはUIを表示しない
  return null;
}

