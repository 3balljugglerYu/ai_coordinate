"use client";

import type { UserStats } from "../lib/server-api";

interface UserStatsProps {
  stats: UserStats;
}

export function UserStats({ stats }: UserStatsProps) {
  const statItems = [
    { label: "生成", value: stats.generatedCount },
    { label: "投稿", value: stats.postedCount },
    { label: "いいね", value: stats.likeCount },
    { label: "閲覧", value: stats.viewCount },
  ];

  return (
    <div className="mb-6 border-t border-b border-gray-200 py-4">
      <div className="grid grid-cols-4 gap-4 text-center">
        {statItems.map((item, index) => (
          <div key={index}>
            <div className="text-lg font-bold text-gray-900">{item.value}</div>
            <div className="text-xs text-gray-600">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

