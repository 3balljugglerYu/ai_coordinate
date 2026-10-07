"use client";

import { useTranslations } from "next-intl";
import { useGachaAvailable } from "@/features/generation/components/GachaAvailabilityProvider";
import { useNameInputAvailable } from "@/features/generation/components/NameInputAvailabilityProvider";
import { isGachaPost } from "../lib/gacha-post";
import { isNameInputPost } from "../lib/name-input-post";

const BADGE_CLASS =
  "rounded-md bg-pink-500 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-white";

/** 「ガチャ」「名前入り」の札を出すか(どちらも公開前は運営だけ)。 */
export function usePostGimmickBadges(post: { generation_metadata?: unknown }) {
  const showsGacha = useGachaAvailable() && isGachaPost(post);
  const showsNameInput = useNameInputAvailable() && isNameInputPost(post);
  return { showsGacha, showsNameInput, any: showsGacha || showsNameInput };
}

/**
 * 投稿カードの角に積む、プロンプトの仕掛けの札(生成方法のラベルの真上)。
 * 「名前入り」は「ガチャ」の右隣に並べる(2026-10-06 ユーザー決定)。
 */
export function PostGimmickBadges({
  showsGacha,
  showsNameInput,
}: {
  showsGacha: boolean;
  showsNameInput: boolean;
}) {
  const t = useTranslations("posts");
  if (!showsGacha && !showsNameInput) return null;
  return (
    <div className="flex items-center gap-1" data-testid="post-gimmick-badges">
      {showsGacha ? (
        <span className={BADGE_CLASS} data-testid="post-gacha-badge">
          {t("gachaBadge")}
        </span>
      ) : null}
      {showsNameInput ? (
        <span className={BADGE_CLASS} data-testid="post-name-input-badge">
          {t("nameInputBadge")}
        </span>
      ) : null}
    </div>
  );
}
