"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
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

/**
 * Before / After を並べるときのカード幅。
 *
 * 180px のまま2分割すると1枚あたり 87px になり、衣装のディテールが判別できない。
 * それでは「プロンプトの効果を見て判断する」という目的を果たせないので広げる。
 * 中身が枠を埋めるので、横幅いっぱいに伸ばしたときのような不自然さは出ない。
 */
const CARD_WIDTH_WITH_BEFORE_PX = 320;

/** 実寸が取れていない原作のフォールバック比率。One-Tap Style のカードと同じ 3:4。 */
const FALLBACK_ASPECT_RATIO = 180 / 240;

/**
 * 横長と見なす閾値。
 * 横長を横並びにすると全体が極端に横長になるため、縦並びへ切り替える。
 */
const LANDSCAPE_RATIO_THRESHOLD = 1.1;

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
 * 原作が「生成前の画像も表示する」設定なら Before / After を並べる。
 * プロンプトが見えない閲覧者にとって、After 1枚では「プロンプトの効果」と
 * 「元のうちの子の魅力」が区別できない。並べることで、そのプロンプトが何を
 * 変えるのかが分かる。非公開プロンプトでは Before/After が仕様書の代わりになる。
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

  /*
    Before を並べるか。

    プロンプトが見えない閲覧者にとって、After 1枚では「プロンプトの効果」と
    「元のうちの子の魅力」が区別できない。Before を並べると、そのプロンプトが
    何を変えるのかが分かる。原作者が「生成前の画像も表示する」を外している場合は
    resolver 側で null になっているので、設定はそのまま尊重される。
  */
  const showsBefore = !!reference.thumbnailUrl && !!reference.beforeThumbnailUrl;
  // 向きは After で決める。じゆうモードは出力比率を元画像と別に選べるため、
  // Before と After で向きが違うことがある。
  const isLandscape = aspectRatio > LANDSCAPE_RATIO_THRESHOLD;
  const cardWidth = showsBefore ? CARD_WIDTH_WITH_BEFORE_PX : CARD_WIDTH_PX;
  // 横並びは1セルが半分の幅になるので、セルの比率は変えずにそのまま使う。
  const cellSizes = showsBefore
    ? `${Math.round(cardWidth / (isLandscape ? 1 : 2))}px`
    : `${cardWidth}px`;

  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-gray-700">
        {isDerivedPost
          ? t("sourcePromptCardTitleDerived")
          : t("sourcePromptCardTitle")}
      </p>

      <Card
        className={`overflow-hidden p-0 ${canGenerate ? "" : "opacity-70"}`}
        style={{ width: cardWidth, maxWidth: "100%" }}
      >
        {/*
          サムネイル。利用不可のときは含めない（REQ-014）ので、錠アイコンの
          プレースホルダへ差し替える。高さが変わると隣の文字が動くため、
          プレースホルダも同じ比率で描く。

          Before/After を並べるときは、正方形・縦長なら横並び、横長なら縦並びに
          する。横長を横並びにすると全体が極端に横長になり、縦長を縦並びにすると
          極端に縦長になる。どちらもカードとして収まりが悪い。

          両セルは After の比率を共有する。Before の実寸は保存していないため
          （詳細は types.ts のコメント）、object-top で顔を残す形にしている。
        */}
        <div
          className={`flex w-full ${
            showsBefore && isLandscape ? "flex-col" : "flex-row"
          }`}
        >
          <div
            className="relative flex-1 overflow-hidden bg-gray-100"
            style={{ aspectRatio }}
            data-testid="source-prompt-after-frame"
          >
            {reference.thumbnailUrl ? (
              <Image
                src={reference.thumbnailUrl}
                alt={t("sourcePromptThumbnailAlt")}
                fill
                sizes={cellSizes}
                className="object-cover object-top"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Lock className="h-6 w-6 text-gray-400" aria-hidden="true" />
              </div>
            )}
            {showsBefore ? (
              <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                {t("afterImageLabel")}
              </span>
            ) : null}
          </div>

          {showsBefore && reference.beforeThumbnailUrl ? (
            <div
              className="relative flex-1 overflow-hidden border-l bg-gray-100"
              style={{ aspectRatio }}
              data-testid="source-prompt-before-frame"
            >
              <Image
                src={reference.beforeThumbnailUrl}
                alt={t("beforeImageAlt")}
                fill
                sizes={cellSizes}
                className="object-cover object-top"
              />
              <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                {t("beforeImageLabel")}
              </span>
            </div>
          ) : null}
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

      {/*
        原作者のプロフィールへの導線。

        原作が使えなくなっていても出す。作者は実在しており、クレジットは
        保持する仕様（REQ-011）なので、「使えないけれど誰の作品かは辿れる」
        状態が正しい。原作者自身には出さない（自分のプロフィールへ飛ばす
        リンクは雑音になる。フォローボタンを出さないのと同じ理由）。
      */}
      {reference.authorId && !isOwnPrompt ? (
        <Link
          href={`/users/${encodeURIComponent(reference.authorId)}`}
          className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-gray-50"
        >
          <User className="h-3.5 w-3.5" aria-hidden="true" />
          {t("sourcePromptViewProfile")}
        </Link>
      ) : null}

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
