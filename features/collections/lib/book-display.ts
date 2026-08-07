/**
 * コレクション完走の book(めくれる日記帳/雑誌)表示のカテゴリ別設定。
 *
 * - 裏表紙(book_back_cover_mode): 固定の革表紙 or 最後の生成画像
 * - ページの紙比率: カテゴリの出力比率(output_aspect_ratio_mode)をそのまま紙の形にする
 *
 * 紙比率を画面実測に任せると、3:4 で生成した企画が 9:16 前後の紙に収まり
 * ページ内へ上下の余白が出る。生成比率が確定しているカテゴリでは紙自体を
 * その比率にして、余白を紙の外(背景)へ逃がす。
 */
import {
  GEMINI_SUPPORTED_ASPECT_RATIOS,
  type GeminiAspectRatio,
} from "@/shared/generation/gemini-aspect-ratio";
import type { StyleOutputAspectRatioMode } from "@/shared/generation/style-output-aspect-ratio";

/**
 * 裏表紙の出し方。
 * - "default"   … 固定の革表紙(End of Volume)。従来挙動
 * - "last_page" … 最後の生成画像を裏表紙にし、固定の革表紙は描画しない
 */
export const BOOK_BACK_COVER_MODES = ["default", "last_page"] as const;

export type BookBackCoverMode = (typeof BOOK_BACK_COVER_MODES)[number];

export function isBookBackCoverMode(value: unknown): value is BookBackCoverMode {
  return (
    typeof value === "string" &&
    (BOOK_BACK_COVER_MODES as readonly string[]).includes(value)
  );
}

/** 未知値・NULL は現行挙動("default")へ倒す。 */
export function normalizeBookBackCoverMode(value: unknown): BookBackCoverMode {
  return isBookBackCoverMode(value) ? value : "default";
}

const RATIO_BY_LABEL = new Map<string, number>(
  GEMINI_SUPPORTED_ASPECT_RATIOS.map((entry) => [entry.label, entry.value]),
);

/**
 * カテゴリの出力比率モードから、本のページ(紙)の幅/高さ比を解決する。
 *
 * "source" / "preset_image" / "user_select" は完走者ごとに比率が変わり得るため
 * null を返し、呼び出し側は従来どおり表示領域いっぱいの紙にフォールバックする。
 */
export function resolveBookPageAspectRatio(
  mode: StyleOutputAspectRatioMode | null | undefined,
): number | null {
  if (mode == null) return null;
  return RATIO_BY_LABEL.get(mode as GeminiAspectRatio) ?? null;
}

export interface BookCompositionInput {
  /** 共通固定表紙(book_cover_path)の URL。null なら先頭ページを表紙に回す。 */
  fixedCoverImageUrl: string | null;
  /** 完走者の生成画像(順序付き)。 */
  pageImageUrls: readonly string[];
  backCoverMode: BookBackCoverMode;
}

export interface BookComposition {
  /** 0ページ目(表紙)。 */
  coverImageUrl: string | null;
  /** 中身のページ(表紙・裏表紙を除く)。 */
  bodyImageUrls: string[];
  /** 裏表紙の画像。null なら固定の革表紙にフォールバックする。 */
  backCoverImageUrl: string | null;
}

/**
 * 完走画像の並びを 表紙 / 中身 / 裏表紙 に振り分ける。
 *
 * 表紙: 共通固定表紙があればそれ。無ければ先頭(sort_order 最小)の生成画像を回す
 *       (= 完走数 N は表紙プリセットを含む)。
 * 裏表紙: backCoverMode="last_page" のとき末尾の1枚を回す。中身が空になってしまう
 *         (=振り分け後に読むページが無い)ときは回さず、固定の革表紙へフォールバックする。
 */
export function composeBookPages({
  fixedCoverImageUrl,
  pageImageUrls,
  backCoverMode,
}: BookCompositionInput): BookComposition {
  const hasFixedCover = Boolean(fixedCoverImageUrl);
  const coverImageUrl = fixedCoverImageUrl ?? pageImageUrls[0] ?? null;
  const contentImageUrls = hasFixedCover
    ? [...pageImageUrls]
    : pageImageUrls.slice(1);

  const useLastPageAsBackCover =
    backCoverMode === "last_page" && contentImageUrls.length >= 2;

  return {
    coverImageUrl,
    bodyImageUrls: useLastPageAsBackCover
      ? contentImageUrls.slice(0, -1)
      : contentImageUrls,
    backCoverImageUrl: useLastPageAsBackCover
      ? (contentImageUrls[contentImageUrls.length - 1] ?? null)
      : null,
  };
}
