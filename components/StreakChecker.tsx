"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { checkStreakBonus } from "@/features/credits/lib/api";

/**
 * ストリーク（連続ログイン）特典チェックコンポーネント
 * 認証が必要なページで使用し、マウント時にストリーク特典をチェックします
 */
export function StreakChecker() {
  const { toast } = useToast();

  useEffect(() => {
    const checkBonus = async () => {
      try {
        const data = await checkStreakBonus();

        // 特典が付与された場合、Toast通知を表示
        if (data.bonus_granted && data.bonus_granted > 0) {
          const streakDays = data.streak_days ?? 0;
          toast({
            title: "連続ログイン特典ボーナス！",
            description: `${streakDays}日連続ログインで${data.bonus_granted}ペルコインを獲得しました！`,
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
      }
    };

    checkBonus();
  }, [toast]);

  // このコンポーネントはUIを表示しない
  return null;
}

