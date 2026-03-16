"use client";

import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useNotifications } from "../hooks/useNotifications";
import { cn } from "@/lib/utils";

interface NotificationBadgeProps {
  onClick?: () => void;
  className?: string;
}

/**
 * 通知バッジコンポーネント
 * 未読数を表示し、クリックで通知リストを開く
 * クリック時にすべての通知を既読にする
 */
export function NotificationBadge({
  onClick,
  className,
}: NotificationBadgeProps) {
  const t = useTranslations("notifications");
  const { unreadCount, markAllRead } = useNotifications();

  const handleClick = async () => {
    // 未読通知がある場合、すべて既読にする
    if (unreadCount > 0) {
      try {
        await markAllRead();
      } catch (error) {
        console.error("Failed to mark all notifications as read:", error);
      }
    }
    // 親コンポーネントのonClickハンドラーを実行
    onClick?.();
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className={cn(
        "relative flex items-center justify-center p-2 h-auto",
        className
      )}
      aria-label={
        unreadCount > 0
          ? t("badgeAriaWithCount", { count: unreadCount })
          : t("badgeAria")
      }
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500" />
      )}
    </Button>
  );
}
