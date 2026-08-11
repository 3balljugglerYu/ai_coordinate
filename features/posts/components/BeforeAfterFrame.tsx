"use client";

import Image from "next/image";

/**
 * 横長と見なす閾値。
 * 横長を横並びにすると全体が極端に横長になるため、縦並びへ切り替える。
 */
export const LANDSCAPE_RATIO_THRESHOLD = 1.1;

/** 実寸が取れていないときのフォールバック比率。One-Tap Style のカードと同じ 3:4。 */
export const FALLBACK_ASPECT_RATIO = 180 / 240;

/** 与えられた比率が「縦並びにすべき横長」かどうか。 */
export function isLandscapeRatio(aspectRatio: number): boolean {
  return aspectRatio > LANDSCAPE_RATIO_THRESHOLD;
}

interface BeforeAfterFrameProps {
  afterUrl: string | null;
  /** null なら After 1枚だけを描画する(Before が無い投稿) */
  beforeUrl: string | null;
  /**
   * After 画像の比率(width / height)。両セルで共有する。
   * Before の実寸は保存していないため After に合わせ、object-top で顔を残す。
   */
  aspectRatio: number;
  afterAlt: string;
  beforeAlt: string;
  afterLabel: string;
  beforeLabel: string;
  /** next/image の sizes。呼び出し側のカード幅から決める。 */
  sizes: string;
  /** data-testid の接頭辞。`{prefix}-after-frame` / `{prefix}-before-frame` になる。 */
  testIdPrefix: string;
  /** 画像タップ時のハンドラ。0 = After / 1 = Before。省略時はタップ不可。 */
  onImageClick?: (index: number) => void;
  /** 拡大できることを伝える読み上げラベル(onImageClick 指定時のみ使う) */
  imageButtonLabel?: string;
  /**
   * 先頭カードの先読み。**Before/After の両方に効かせる**。
   * After だけに付けると、並んでいるのに Before だけ遅れて出てきて
   * 「後から差し込まれた」ように見える。1枚の絵として同時に出す。
   */
  priority?: boolean;
  /**
   * Before が無い1枚表示のとき、縦長画像の高さを幅までに収めるか（既定 false）。
   *
   * フィードで有効にする。1枚表示の縦長をそのまま出すと画面をほぼ占有し、
   * Before/After を並べた投稿より目立ってしまう。「Before を出さない方が
   * 大きく見える」状態は、Before/After で価値を伝えるという狙いと逆を向く。
   *
   * 収まりきらない分は切り取らず、左右に余白を作って中央に置く。
   * うちの子の全身を切るより、余白が出る方が投稿者の意図に沿う。
   */
  clampPortraitToWidth?: boolean;
}

/**
 * Before / After を 1:1 で並べる共通枠。
 *
 * プロンプトが見えない閲覧者にとって、After 1枚では「プロンプトの効果」と
 * 「元のうちの子の魅力」が区別できない。並べることで、そのプロンプトが何を
 * 変えるのかが分かる。
 *
 * 正方形・縦長なら横並び、横長なら縦並びにする。横長を横並びにすると全体が
 * 極端に横長になり、縦長を縦並びにすると極端に縦長になる。どちらもカードとして
 * 収まりが悪い。向きは After で決める(じゆうモードは出力比率を元画像と別に
 * 選べるため、Before と After で向きが違うことがある)。
 *
 * もとは SourcePromptReferenceCard の中にあった描画を、フィードカードと
 * 共有するために切り出したもの。DOM 構造(行 > After セル > Before セル)は
 * 変えていない。
 */
export function BeforeAfterFrame({
  afterUrl,
  beforeUrl,
  aspectRatio,
  afterAlt,
  beforeAlt,
  afterLabel,
  beforeLabel,
  sizes,
  testIdPrefix,
  onImageClick,
  imageButtonLabel,
  priority = false,
  clampPortraitToWidth = false,
}: BeforeAfterFrameProps) {
  const showsBefore = !!afterUrl && !!beforeUrl;
  const isLandscape = isLandscapeRatio(aspectRatio);

  /*
    1枚表示のときだけ、高さを幅までに収める(比率 = 幅/高さ なので下限1)。
    Before/After を並べるときは1セルが半分の幅になり、そもそも縦に伸びすぎない。
    こちらは実寸に従わせ、両セルで比率を共有する既存の作法を保つ。
  */
  const shouldClamp = clampPortraitToWidth && !showsBefore && aspectRatio < 1;
  const frameAspectRatio = shouldClamp ? 1 : aspectRatio;
  // 収まりきらない分を切らずに中央へ置く。左右に余白ができる。
  const afterImageFit = shouldClamp ? "object-contain" : "object-cover object-top";

  // 画像を押せるようにするかどうか。押せないときは余計な role を付けない。
  const clickableProps = (index: number) =>
    onImageClick
      ? {
          role: "button" as const,
          tabIndex: 0,
          "aria-label": imageButtonLabel,
          onClick: (event: React.MouseEvent) => {
            // 画像は拡大ビューだけを開く。親カードの詳細遷移へは伝えない
            event.stopPropagation();
            onImageClick(index);
          },
          onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onImageClick(index);
            }
          },
        }
      : {};

  return (
    <div className={`flex w-full ${showsBefore && isLandscape ? "flex-col" : "flex-row"}`}>
      <div
        className={`relative flex-1 overflow-hidden bg-gray-100 ${
          onImageClick ? "cursor-zoom-in" : ""
        }`}
        style={{ aspectRatio: frameAspectRatio }}
        data-testid={`${testIdPrefix}-after-frame`}
        {...clickableProps(0)}
      >
        {afterUrl ? (
          <Image
            src={afterUrl}
            alt={afterAlt}
            fill
            sizes={sizes}
            className={afterImageFit}
            priority={priority}
          />
        ) : null}
        {showsBefore ? (
          <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
            {afterLabel}
          </span>
        ) : null}
      </div>

      {showsBefore && beforeUrl ? (
        <div
          className={`relative flex-1 overflow-hidden border-l bg-gray-100 ${
            onImageClick ? "cursor-zoom-in" : ""
          }`}
          style={{ aspectRatio }}
          data-testid={`${testIdPrefix}-before-frame`}
          {...clickableProps(1)}
        >
          <Image
            src={beforeUrl}
            alt={beforeAlt}
            fill
            sizes={sizes}
            className="object-cover object-top"
            priority={priority}
          />
          <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
            {beforeLabel}
          </span>
        </div>
      ) : null}
    </div>
  );
}
