"use client";

import { useTranslations } from "next-intl";
import { GenerationResultPanel } from "./GenerationResultPanel";
import { ImageDownloadButton } from "./ImageDownloadButton";
import { applyPerstaWatermark } from "@/features/generation/lib/apply-watermark";
import { WardrobeSaveButton } from "@/features/wardrobe/components/WardrobeSaveButton";

/**
 * ゲスト DL のファイル名規則。`determineFileName` がこの ID を fallback
 * として使う。連続 DL 時の重複は OS 側の連番付与（"... (1).png" 等）に任せる。
 *
 * 当初は `coordinate-guest-{timestamp}` で結果ごとにユニークにする計画だったが、
 * React Compiler ルールが render/effect 中の `Date.now()` 呼び出しを禁止して
 * いるため固定 ID に変更した。実害（同名ファイルの上書き）は OS の連番付与で
 * 回避される。
 */
const GUEST_DOWNLOAD_ID = "coordinate-guest";

export interface GuestResultPreviewImage {
  url: string;
  mimeType: string;
}

export interface GuestResultPreviewProps {
  /**
   * 表示する生成画像。null の間は placeholder を表示。
   * `<GenerationFormContainer>` が in-memory で保持し、リロードで消える (UCL-017)。
   */
  result: GuestResultPreviewImage | null;
  /**
   * 「保存する（＝アカウントへ保存してログイン転換）」ボタンをクリックされたときの handler。
   * `useWardrobeSave().requestSave` をラップして渡す想定。signup 固定モーダルを開く。
   */
  onSaveToAccountClick: () => void;
}

/**
 * /coordinate ゲスト用の生成結果プレビュー。
 *
 * - DB 保存しない data URL を直接表示する
 * - リロードで消える（state が消えるため）
 * - 結果が無い間は placeholder 文言（/style と同じ panel シェル）
 * - 結果がある時はパネル右上にダウンロードボタン、footer に「ログインで履歴に残せる」CTA
 *
 * UCL-017 / 計画書 Phase 6 / Step 3 (ゲスト DL 追加)
 */
export function GuestResultPreview({
  result,
  onSaveToAccountClick,
}: GuestResultPreviewProps) {
  const t = useTranslations("coordinate");

  return (
    <GenerationResultPanel
      title={t("guestResultTitle")}
      placeholder={t("guestResultPlaceholder")}
      resultImageUrl={result?.url ?? null}
      resultImageAlt={t("guestResultAlt")}
      aspectRatio={1}
      action={
        result ? (
          <div className="flex items-center gap-2">
            <ImageDownloadButton
              imageUrl={result.url}
              id={GUEST_DOWNLOAD_ID}
              variant="outline"
              label={t("guestResultDownloadAction")}
              ariaLabel={t("guestResultDownloadAriaLabel")}
              messages={{
                accessDenied: t("guestResultDownloadFailed"),
                fetchFailed: () => t("guestResultDownloadFailed"),
                failedFallback: t("guestResultDownloadFailed"),
                successTitle: t("guestResultDownloadSuccessTitle"),
                successDescription: t("guestResultDownloadSuccessDescription"),
              }}
              transformBlob={applyPerstaWatermark}
            />
            <WardrobeSaveButton onClick={onSaveToAccountClick} />
          </div>
        ) : null
      }
      footer={
        result ? (
          <div
            data-testid="guest-result-preview"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3"
          >
            <p className="text-sm text-amber-900">{t("guestResultSaveHint")}</p>
          </div>
        ) : null
      }
    />
  );
}
