"use client";

import { Bell } from "lucide-react";
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
      aria-label={`通知${unreadCount > 0 ? `（未読${unreadCount}件）` : ""}`}
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500" />
      )}
    </Button>
  );
}

