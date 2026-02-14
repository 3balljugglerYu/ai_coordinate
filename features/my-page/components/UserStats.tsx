"use client";

import type { UserStats } from "../lib/server-api";
import { formatCountEnUS } from "@/lib/utils";

interface UserStatsProps {
  stats: UserStats;
}

export function UserStats({ stats }: UserStatsProps) {
  const firstRowItems = [
    { label: "フォロー", value: formatCountEnUS(stats.followingCount) },
    { label: "フォロワー", value: formatCountEnUS(stats.followerCount) },
    { label: "いいね", value: formatCountEnUS(stats.likeCount) },
  ];

  const secondRowItems = [
    { label: "閲覧", value: formatCountEnUS(stats.viewCount) },
    { label: "投稿", value: formatCountEnUS(stats.postedCount) },
    {
      label: "生成",
      value: stats.generatedCountPublic
        ? formatCountEnUS(stats.generatedCount)
        : "—",
    },
  ];

  return (
    <div className="mb-6 border-t border-b border-gray-200 py-4">
      {/* 1行目: フォロー、フォロワー、いいね */}
      <div className="grid grid-cols-3 gap-4 text-center mb-4">
        {firstRowItems.map((item) => (
          <div key={item.label}>
            <div className="text-lg font-bold text-gray-900">{item.value}</div>
            <div className="text-xs text-gray-600">{item.label}</div>
          </div>
        ))}
      </div>
      {/* 2行目: 閲覧、投稿、生成 */}
      <div className="grid grid-cols-3 gap-4 text-center">
        {secondRowItems.map((item) => (
          <div key={item.label}>
            <div className="text-lg font-bold text-gray-900">{item.value}</div>
            <div className="text-xs text-gray-600">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

