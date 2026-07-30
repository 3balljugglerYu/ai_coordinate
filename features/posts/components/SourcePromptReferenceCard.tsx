"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Lock, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FollowButton } from "@/features/users/components/FollowButton";
import type { SubscriptionPlan } from "@/features/subscription/subscription-config";
import type { SourcePromptReference } from "../types";

/**
 * 生成シートは遅延読み込みにする。
 *
 * シートはじゆうモードの生成フォーム一式（画像ピッカー・モデル選択・ジョブの
 * ポーリング）を抱えており、投稿詳細を開いた全員にその重さを払わせる理由がない。
 * 押した人だけが読み込む。
 */
const PromptLockedGenerationSheet = dynamic(
  () =>
    import(
      "@/features/generation/components/PromptLockedGenerationSheet"
    ).then((mod) => mod.PromptLockedGenerationSheet),
  { ssr: false }
);

interface SourcePromptReferenceCardProps {
  reference: SourcePromptReference;
  /** 閲覧者。null は未ログイン。 */
  currentUserId: string | null;
  /**
   * 閲覧者が原作者をフォローしているか。
   * 呼び出し側が既に取得している follow-status をそのまま使う。
   * サーバーの payload に載せないのは、`use cache` の粒度と噛み合わず
   * フォロー直後に反映されないカードになるため。
   */
  isFollowingAuthor: boolean;
  /** 派生投稿の詳細で表示しているか。表題を「原作の〜」に変える。 */
  isDerivedPost: boolean;
  subscriptionPlan: SubscriptionPlan;
}

/**
 * プロンプト非公開投稿・派生投稿のプロンプト欄に出すカード（REQ-013）。
 *
 * 本文は描画しない。原作者のクレジット・サムネイル・利用数と、
 * 「このプロンプトで作る」の入口だけを持つ。
 *
 * 押せない理由は3つあり、それぞれ別の文言を出す。
 *
 * - 原作が内在的に使えない → 「現在、ご利用できません」
 *   削除・投稿取消・公開停止・公開へ戻された、のどれであっても同じ文言にする。
 *   区別できると原作の状態を推測できてしまう（ADR-005）。
 * - 未ログイン → 「ログインすると使えます」
 * - 未フォロー → 「フォローすると使えます」＋カード内にフォローボタン
 *
 * 未ログイン・未フォローを利用不可と同じ文言にまとめないのは、これらが
 * 閲覧者側で解消できる状態であり、次の行動を示せるためである。
 */
export function SourcePromptReferenceCard({
  reference,
  currentUserId,
  isFollowingAuthor,
  isDerivedPost,
  subscriptionPlan,
}: SourcePromptReferenceCardProps) {
  const t = useTranslations("posts");
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const isOwnPrompt =
    !!currentUserId && !!reference.authorId && currentUserId === reference.authorId;
  // フォロー条件の対象は原作者。派生投稿を見ているときも原作者を見る（ADR-003）。
  const hasAccess = isOwnPrompt || isFollowingAuthor;
  const canGenerate = reference.isAvailable && !!currentUserId && hasAccess;

  const blockedReason = !reference.isAvailable
    ? t("sourcePromptUnavailable")
    : !currentUserId
      ? t("sourcePromptLoginToUse")
      : !hasAccess
        ? t("sourcePromptFollowToUse")
        : null;

  const authorName = reference.authorNickname?.trim();

  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-gray-700">
        {isDerivedPost
          ? t("sourcePromptCardTitleDerived")
          : t("sourcePromptCardTitle")}
      </p>

      <Card
        className={`overflow-hidden p-3 ${
          canGenerate ? "" : "opacity-70"
        }`}
      >
        <div className="flex items-center gap-3">
          {/* 利用不可のときはサムネイルを含めない（REQ-014）。錠アイコンで代替する。 */}
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-gray-100">
            {reference.thumbnailUrl ? (
              <Image
                src={reference.thumbnailUrl}
                alt={t("sourcePromptThumbnailAlt")}
                fill
                sizes="64px"
                className="object-cover object-top"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Lock className="h-5 w-5 text-gray-400" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            {/* 原作者のクレジット。原作が削除されていても出す（REQ-011）。 */}
            {authorName ? (
              <p className="truncate text-sm font-medium text-gray-900">
                {t("sourcePromptCredit", { name: authorName })}
              </p>
            ) : null}

            {reference.usageCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("sourcePromptUsageCount", { count: reference.usageCount })}
              </p>
            ) : null}

            {blockedReason ? (
              <p className="text-xs font-medium text-amber-700">
                {blockedReason}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canGenerate ? (
            <button
              type="button"
              onClick={() => setIsSheetOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t("sourcePromptCardTitle")}
            </button>
          ) : null}

          {/*
            未フォローならカード内で解消できるようにする（ヒアリング済みの決定）。
            原作が使えない状態でフォローを促しても解決しないので、そのときは出さない。
          */}
          {reference.isAvailable &&
          reference.authorId &&
          !isOwnPrompt &&
          !isFollowingAuthor ? (
            <FollowButton
              userId={reference.authorId}
              currentUserId={currentUserId}
            />
          ) : null}
        </div>
      </Card>

      {canGenerate ? (
        <PromptLockedGenerationSheet
          open={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          sourcePostId={reference.postId}
          subscriptionPlan={subscriptionPlan}
        />
      ) : null}
    </div>
  );
}
