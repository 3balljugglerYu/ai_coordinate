"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Lock, Sparkles, User } from "lucide-react";
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

/**
 * カード幅。One-Tap Style のプリセットカード (StylePresetPreviewCard) と揃える。
 * 横幅いっぱいに伸ばすとサムネイルの枠が不自然に横長になるため固定にする。
 */
const CARD_WIDTH_PX = 180;

/** 実寸が取れていない原作のフォールバック比率。One-Tap Style のカードと同じ 3:4。 */
const FALLBACK_ASPECT_RATIO = 180 / 240;

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
 * 見た目は One-Tap Style のプリセットカードに合わせた縦型で、サムネイルの下に
 * クレジットを置く。ただしサムネイルの比率は原作画像の実寸に従う。
 * プリセットは運営が用意した固定比率の画像だが、原作はユーザーの生成物で
 * 縦横比がまちまちなので、固定枠に押し込むと切り取られてしまう。
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
  // 実寸が揃っているときだけ原作の比率を使う。片方でも欠けたら既定へ倒す。
  const aspectRatio =
    reference.thumbnailWidth && reference.thumbnailHeight
      ? reference.thumbnailWidth / reference.thumbnailHeight
      : FALLBACK_ASPECT_RATIO;

  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-gray-700">
        {isDerivedPost
          ? t("sourcePromptCardTitleDerived")
          : t("sourcePromptCardTitle")}
      </p>

      <Card
        className={`overflow-hidden p-0 ${canGenerate ? "" : "opacity-70"}`}
        style={{ width: CARD_WIDTH_PX }}
      >
        {/*
          サムネイル。利用不可のときは含めない（REQ-014）ので、錠アイコンの
          プレースホルダへ差し替える。高さが変わると隣の文字が動くため、
          プレースホルダも同じ比率で描く。
        */}
        <div
          className="relative w-full overflow-hidden bg-gray-100"
          style={{ aspectRatio }}
        >
          {reference.thumbnailUrl ? (
            <Image
              src={reference.thumbnailUrl}
              alt={t("sourcePromptThumbnailAlt")}
              fill
              sizes={`${CARD_WIDTH_PX}px`}
              className="object-cover object-top"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Lock className="h-6 w-6 text-gray-400" aria-hidden="true" />
            </div>
          )}
        </div>

        {/* サムネイルの下にクレジットと利用数を置く（One-Tap Style のカードと同じ配置） */}
        <div className="space-y-1 border-t bg-white px-3 py-2">
          {authorName ? (
            <div className="flex items-center gap-1.5">
              {reference.authorAvatarUrl ? (
                <Image
                  src={reference.authorAvatarUrl}
                  alt=""
                  width={20}
                  height={20}
                  className="shrink-0 rounded-full object-cover ring-1 ring-black/10"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 ring-1 ring-black/10"
                >
                  <User className="h-3 w-3 text-gray-500" />
                </span>
              )}
              <p className="truncate text-xs font-medium text-slate-900">
                {t("sourcePromptCredit", { name: authorName })}
              </p>
            </div>
          ) : null}

          {reference.usageCount > 0 ? (
            <p className="text-[11px] leading-tight text-muted-foreground">
              {t("sourcePromptUsageCount", { count: reference.usageCount })}
            </p>
          ) : null}
        </div>
      </Card>

      {blockedReason ? (
        <p className="text-xs font-medium text-amber-700">{blockedReason}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
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
