"use client";

import { type CSSProperties, type ReactNode } from "react";
import { Card } from "@/components/ui/card";

interface GenerationResultPanelProps {
  /** ヘッダーに出すタイトル。例: "生成結果" */
  title: string;
  /** 結果画像が無い時に表示する案内文。 */
  placeholder: string;
  /** 結果画像 URL。null の間は placeholder のみ表示。 */
  resultImageUrl: string | null;
  /** alt 属性。スクリーンリーダー対応。 */
  resultImageAlt: string;
  /** 表示シェルのアスペクト比。プリセットや生成済み画像から導出した値を渡す。 */
  aspectRatio: number;
  /** 画像読み込み完了時のコールバック。実比率が判定できればその値を渡す。 */
  onResultImageLoad?: (imageAspectRatio: number | null) => void;
  /** 右上に並べる任意のアクション（ダウンロード／投稿／ログイン CTA など）。 */
  action?: ReactNode;
  /** 画像の下、Card の外に出すヒント文（保存方法の案内など）。 */
  footer?: ReactNode;
}

/**
 * 「生成結果（直近の 1 枚）」を表示する汎用パネル。
 *
 * 元々 /style の StylePageClient 内に閉じていた `StyleResultPanel` を抽出。
 * /coordinate のゲスト表示でも同じシェルを再利用するため共通コンポーネント化。
 *
 * - 結果画像が無いときは placeholder 文言を表示
 * - 結果画像があるときは aspect ratio を維持しつつ object-contain で表示
 * - title 横に任意の action（ボタン群など）を配置できる
 * - Card の下に任意の footer（保存方法ヒントなど）を配置できる
 */
export function GenerationResultPanel({
  title,
  placeholder,
  resultImageUrl,
  resultImageAlt,
  aspectRatio,
  onResultImageLoad,
  action,
  footer,
}: GenerationResultPanelProps) {
  const desktopMaxWidthPx = Math.min(460, Math.round(550 * aspectRatio));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        {action ?? null}
      </div>
      <Card
        data-testid="generation-result-card"
        className="w-full max-w-[340px] overflow-hidden p-0 sm:max-w-[420px] md:max-w-[var(--generation-result-desktop-max-width)]"
        style={
          {
            "--generation-result-desktop-max-width": `${desktopMaxWidthPx}px`,
          } as CSSProperties
        }
      >
        <div
          data-testid="generation-result-shell"
          className="relative w-full bg-slate-100"
          style={{ aspectRatio: String(aspectRatio) }}
        >
          {resultImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resultImageUrl}
              alt={resultImageAlt}
              className="absolute inset-0 h-full w-full object-contain"
              onLoad={(event) => {
                const imageAspectRatio =
                  event.currentTarget.naturalWidth > 0 &&
                  event.currentTarget.naturalHeight > 0
                    ? event.currentTarget.naturalWidth /
                      event.currentTarget.naturalHeight
                    : null;

                onResultImageLoad?.(imageAspectRatio);
              }}
            />
          ) : null}
          {!resultImageUrl ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="px-4 text-center text-sm text-slate-500">
                {placeholder}
              </p>
            </div>
          ) : null}
        </div>
      </Card>
      {footer ?? null}
    </section>
  );
}
