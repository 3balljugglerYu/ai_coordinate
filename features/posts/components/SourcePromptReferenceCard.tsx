"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Copy, Sparkles, User } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { FollowButton } from "@/features/users/components/FollowButton";
import { copyTextToClipboard } from "../lib/copy-to-clipboard";
import { fetchSourcePromptText } from "../lib/source-prompt-text-api";
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
 * - 原作が内在的に使えない → **表題と「現在、ご利用できません」だけ**にする。
 *   削除・投稿取消・公開停止・公開へ戻された、のどれであっても同じ文言にする。
 *   区別できると原作の状態を推測できてしまう（ADR-005）。
 * - 未ログイン → カードは出したまま「ログインすると使えます」
 * - 未フォロー → カードは出したまま「フォローすると使えます」＋フォローボタン
 *
 * 未ログイン・未フォローでカードを残すのは、これらが閲覧者側で解消できる状態で
 * あり、サムネイルこそが「解消する価値があるか」の判断材料になるためである。
 * 逆に原作が使えないときは解消できないので、空のサムネイル枠・クレジット・
 * 利用数・プロフィール導線をすべて落とす。取り消した投稿へ注目を集めないことが
 * 原作者の意思に沿う（REQ-011 の UI 部分を改訂。DB 側の系譜保持は変えていない）。
 */
export function SourcePromptReferenceCard({
  reference,
  currentUserId,
  isFollowingAuthor,
  isDerivedPost,
  subscriptionPlan,
}: SourcePromptReferenceCardProps) {
  const t = useTranslations("posts");
  const router = useRouter();
  const { toast } = useToast();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isOpenOriginConfirmOpen, setIsOpenOriginConfirmOpen] = useState(false);

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

  /*
    カードから原作の投稿へ移動できるようにする。

    出すのは派生投稿を見ているときだけ。root の投稿では原作が「いま見ている
    投稿そのもの」なので、押しても同じページへ戻るだけになる。

    タップですぐ移動させず確認を挟むのは、カードが「このプロンプトで作る」の
    ための面でもあり、生成しに来た人が誤タップで別ページへ飛ばされると
    入力内容を失うためである（One-Tap Style のカードと同じ作法）。
  */
  const canOpenOrigin = isDerivedPost && reference.isAvailable;
  /*
    コピーできる条件。

    非公開はフォロワーにも渡さないが、**本人は自分のプロンプトを常にコピーできる**。
    非公開は「第三者へ渡さない」設定であって、自分の資産を自分から遠ざける
    ものではない。ここを公開だけにしていたため、本人が自分の本文を見られるのに
    コピー手段が無い状態になっていた。

    第三者は公開のときだけ。生成と同じフォローゲートを通す。
  */
  const canCopyPrompt =
    canGenerate && (isOwnPrompt || reference.promptVisibility === "public");

  /*
    本文はここでは持たず、押されてから API で取る。

    公開プロンプトはフォロワーにだけ開示する値なので、payload に載せると
    未フォロワーのブラウザにも届いてしまう（従来はそれを表示だけ伏字にしていた）。
    サーバー側でフォロー・ブロック・公開設定を検証してから返す経路に寄せる。
  */
  const handleCopyPrompt = async () => {
    try {
      const promptText = await fetchSourcePromptText(reference.postId);
      await copyTextToClipboard(promptText);
      setIsCopied(true);
      toast({ title: t("sourcePromptCopied") });
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy source prompt:", error);
      toast({
        title: t("sourcePromptCopyFailed"),
        variant: "destructive",
      });
    }
  };
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

      {/*
        原作が使えないときはカードを出さない。空のサムネイル枠が縦に大きく残ると
        壊れて見えるうえ、解消しようのない状態でクレジットや利用数を見せても
        次の行動につながらない。
      */}
      {reference.isAvailable ? (
        <Card
          className={`overflow-hidden p-0 ${canGenerate ? "" : "opacity-70"} ${
            canOpenOrigin ? "cursor-pointer transition hover:ring-2 hover:ring-primary/40" : ""
          }`}
          style={{ width: cardWidth, maxWidth: "100%" }}
          role={canOpenOrigin ? "button" : undefined}
          tabIndex={canOpenOrigin ? 0 : undefined}
          aria-label={
            canOpenOrigin ? t("sourcePromptOpenOriginConfirmTitle") : undefined
          }
          onClick={
            canOpenOrigin
              ? () => setIsOpenOriginConfirmOpen(true)
              : undefined
          }
          onKeyDown={
            canOpenOrigin
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setIsOpenOriginConfirmOpen(true);
                  }
                }
              : undefined
          }
        >
          {/*
            サムネイル。利用不可のカードはそもそも描画しないので、ここで URL が
            無いのは「利用可能だが取得に失敗した」ときだけ。錠アイコンは
            「使えない」意味に読めてしまうため、無地の枠で埋める。

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
              ) : null}
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
      ) : null}

      {/*
        文言の色は「閲覧者が解消できるか」で分ける。

        フォロー・ログインは次の行動につながるので目を引く色にする。
        原作が使えないのは解消しようがないため、目立たせても閲覧者を
        急かすだけになる。ここは落ち着いた灰色にとどめる。
      */}
      {blockedReason ? (
        <p
          className={`text-xs ${
            reference.isAvailable
              ? "font-medium text-amber-700"
              : "text-muted-foreground"
          }`}
        >
          {blockedReason}
        </p>
      ) : null}

      <div className="flex flex-col items-start gap-2">
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
          公開プロンプトはコピーもできる。「作る」はアプリ内で完結し、
          「コピー」は別のツールへ持ち出すためのもので役割が違う。
          編集したい人はコピーして /free へ貼れるので、シートが編集不可でも詰まらない。
        */}
        {canCopyPrompt ? (
          <button
            type="button"
            onClick={handleCopyPrompt}
            className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-gray-50"
          >
            {isCopied ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {isCopied ? t("sourcePromptCopied") : t("sourcePromptCopy")}
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

        原作が使えないときは出さない。取り消した投稿へ注目を集めないことが
        原作者の意思に沿うためで、表題と「現在、ご利用できません」だけを残す。
        原作者自身にも出さない（自分のプロフィールへ飛ばすリンクは雑音になる。
        フォローボタンを出さないのと同じ理由）。
      */}
      {reference.isAvailable && reference.authorId && !isOwnPrompt ? (
        <Link
          href={`/users/${encodeURIComponent(reference.authorId)}`}
          className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-gray-50"
        >
          <User className="h-3.5 w-3.5" aria-hidden="true" />
          {t("sourcePromptViewProfile")}
        </Link>
      ) : null}

      <AlertDialog
        open={isOpenOriginConfirmOpen}
        onOpenChange={setIsOpenOriginConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sourcePromptOpenOriginConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("sourcePromptOpenOriginConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("sourcePromptOpenOriginConfirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                router.push(`/posts/${encodeURIComponent(reference.postId)}`)
              }
            >
              {t("sourcePromptOpenOriginConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {canGenerate ? (
        <PromptLockedGenerationSheet
          open={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          sourcePostId={reference.postId}
          subscriptionPlan={subscriptionPlan}
          promptVisibility={reference.promptVisibility}
        />
      ) : null}
    </div>
  );
}
