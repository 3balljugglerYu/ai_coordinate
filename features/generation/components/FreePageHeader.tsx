"use client";

import { useSyncExternalStore } from "react";
import { Coins, LayoutGrid, Users } from "lucide-react";
import { useUsageRewardAmounts } from "@/features/credits/hooks/useUsageRewardAmounts";
import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";

interface FreePageHeaderProps {
  title: string;
  description: string;
  /** 投稿すると「みんなのカタログ」に並ぶ条件 */
  catalogListed: string;
  /** フォロワーがそのプロンプトで生成できること */
  catalogFollowers: string;
  /** 使われるとペルコインが還元されること(額は書かない) */
  catalogReward: string;
}

/**
 * Free Style（/free）の上部の見出し。
 * docs/planning/catalog-three-tabs-implementation-plan.md Phase 4
 *
 * ⭐ 一般の利用者には、今の見出しと**まったく同じ HTML** を出す（一般公開の日まで
 * 見た目を変えない）。
 *
 * カタログ刷新（公開前は運営だけ）では、/free は「カタログをつくる」のタブになる。
 * h1 はタブの上の見出し（OriginalKindTabs。「カタログをつくる」）が持つので、ここでは出さない。
 */
export function FreePageHeader({
  title,
  description,
  catalogListed,
  catalogFollowers,
  catalogReward,
}: FreePageHeaderProps) {
  const isCatalogRevamp = useStylesCatalogRevamp();

  if (!isCatalogRevamp) {
    return (
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-600">{description}</p>
      </div>
    );
  }

  // 還元額の取得は刷新後の人だけにする（一般の利用者の通り道を変えない）
  return (
    <CatalogCreateHeader
      description={description}
      listed={catalogListed}
      followers={catalogFollowers}
      reward={catalogReward}
    />
  );
}

const noopSubscribe = () => () => {};

function CatalogCreateHeader({
  description,
  listed,
  followers,
  reward,
}: {
  description: string;
  listed: string;
  followers: string;
  reward: string;
}) {
  // 還元が停止中(0)なら言わない。取得前・失敗時も 0 なので、
  // 「もらえないのに還元されると書いてある」ことはない。
  const { promptUsageRewardAmount } = useUsageRewardAmounts();
  /*
    還元の一文はハイドレーションのあとにだけ出す。還元額はモジュール変数に
    キャッシュされ、先に動いた PostProgressHost(LocaleShell)が温めていることがある。
    そのまま出すと、サーバーの HTML(常に 0 で一文なし)と食い違う
    (PromptVisibilityField と同じ理由)。
  */
  const isHydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  const showReward = isHydrated && promptUsageRewardAmount > 0;

  return (
    <div className="mb-6">
      <p className="text-sm text-gray-600">{description}</p>
      <ul className="mt-3 space-y-1.5 rounded-lg border border-pink-100 bg-white/70 p-3 text-xs leading-relaxed text-gray-700">
        <li className="flex items-start gap-2">
          <LayoutGrid
            aria-hidden
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pink-500"
          />
          <span>{listed}</span>
        </li>
        <li className="flex items-start gap-2">
          <Users
            aria-hidden
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pink-500"
          />
          <span>{followers}</span>
        </li>
        {showReward ? (
          <li className="flex items-start gap-2">
            <Coins
              aria-hidden
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500"
            />
            <span>{reward}</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
