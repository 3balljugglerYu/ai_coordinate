"use client";

import { useTranslations } from "next-intl";
import { Loader2, Sparkles } from "lucide-react";
import { useStylePresetGenerationSheet } from "@/features/style/hooks/useStylePresetGenerationSheet";

interface UseStylePresetButtonProps {
  presetId: string;
  /** スタイル紹介ページ(/styles/[slug])。シートを開けないときの行き先。 */
  slug?: string | null;
  /** 閲覧者。null は未ログイン。 */
  currentUserId: string | null;
  /**
   * 閲覧者が確定したか。確定前は未ログインと区別できないので、押しても何もしない
   * (ログイン中の人にログインの案内を出さないため)。
   */
  isViewerResolved: boolean;
}

/**
 * Persta ORIGINAL の「このカタログで生成する」。
 * カタログ刷新後(公開前は運営だけ)に、ホームの引用元カードと投稿詳細に出す
 * (2026-09-30 / 2026-10-01 ユーザー決定)。
 *
 * User ORIGINAL の「このカタログで生成する」(FollowAndUsePromptButton)と同じく、
 * その場で生成シートを開く。開けないときの振る舞いは useStylePresetGenerationSheet を参照。
 */
export function UseStylePresetButton({
  presetId,
  slug,
  currentUserId,
  isViewerResolved,
}: UseStylePresetButtonProps) {
  const { open, isWorking, overlays } = useStylePresetGenerationSheet({
    presetId,
    slug,
    currentUserId,
    isViewerResolved,
  });

  return (
    <>
      <UseCatalogButton onClick={() => void open()} isWorking={isWorking} />
      {overlays}
    </>
  );
}

/**
 * 「このカタログで生成する」の見た目だけ。
 * シートを開く処理を別に持つ場所(投稿詳細のカードはカード自体も押せる)で使う。
 */
export function UseCatalogButton({
  onClick,
  isWorking,
}: {
  onClick: () => void;
  isWorking: boolean;
}) {
  const t = useTranslations("posts");

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isWorking}
        data-testid="feed-use-style-button"
        className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
      >
        {isWorking ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 text-left">{t("feedUseCatalog")}</span>
      </button>
    </div>
  );
}
