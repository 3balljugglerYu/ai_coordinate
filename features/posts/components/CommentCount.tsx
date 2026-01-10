import { MessageCircle } from "lucide-react";
import { formatCountEnUS } from "@/lib/utils";

interface CommentCountProps {
  count: number;
}

/**
 * コメント数表示コンポーネント
 * コメント数をアイコンと数値で表示
 */
export function CommentCount({ count }: CommentCountProps) {
  if (count <= 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      <MessageCircle className="h-4 w-4 text-gray-500" />
      <span className="text-sm text-gray-600">{formatCountEnUS(count)}</span>
    </div>
  );
}
