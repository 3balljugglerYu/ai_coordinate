import { Eye } from "lucide-react";
import { formatCountEnUS } from "@/lib/utils";

interface ViewCountProps {
  count: number;
}

/**
 * 閲覧数表示コンポーネント
 * 閲覧数をアイコンと数値で表示
 */
export function ViewCount({ count }: ViewCountProps) {
  if (count <= 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      <Eye className="h-4 w-4 text-gray-500" />
      <span className="text-sm text-gray-600">{formatCountEnUS(count)}</span>
    </div>
  );
}
