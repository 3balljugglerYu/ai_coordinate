"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import { GenerationStatusCard } from "@/features/generation/components/GenerationStatusCard";
import {
  PSEUDO_INITIAL_PROGRESS,
  calculatePseudoProgress,
} from "@/features/generation/lib/pseudo-progress";
import { ImageLightboxDialog } from "@/features/inspire/components/ImageLightboxDialog";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  SUBMISSION_SOURCES,
  type SubmissionSource,
  buildSubmissionConsents,
  isAllConsentsAcknowledged,
} from "@/features/inspire/lib/creator-looks-submission";

interface PreviewSummary {
  provider: "openai" | "gemini";
  storage_path: string;
}

interface PreviewGenerationResponse {
  template_id: string;
  outcome: "success" | "partial";
  previews: PreviewSummary[];
}

interface UserStyleTemplateSubmissionFormProps {
  /**
   * Step 2 で「試着するキャラ」として表示する画像 URL。
   * 運営が env (INSPIRE_TEST_CHARACTER_IMAGE_URL) で設定した長期 signed URL。
   * 未設定なら placeholder で代替。
   */
  testCharacterImageUrl: string | null;
  /**
   * 「再申請」フローで開かれた場合、元の rejected/withdrawn 行の ID を渡す。
   * submit が成功した時点で、この古い行は自動的に削除される（上書き挙動）。
   * 通常の新規申請では undefined。
   */
  replaceTemplateId?: string | null;
  /**
   * Creator Looks モードか (= 出所申告 + 5 つの同意チェックを追加表示)。
   * server 側で `isCreatorLooksEnabledForUser(user)` を判定して渡す。
   * false (= 既存 Inspire 投稿フロー) ならフォームは現状と同じ挙動。
   */
  isCreatorLooksMode?: boolean;
}

type Step = 1 | 2 | 3;

const ACCEPTED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const stripped = result.replace(/^data:[^;]+;base64,/, "");
      resolve(stripped);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * 上部の Step indicator (1 / 2 / 3 ドット + 接続線)
 */
function StepIndicator({ current }: { current: Step }) {
  const steps: Step[] = [1, 2, 3];
  return (
    <div
      className="mb-2 flex items-center justify-center gap-2"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={3}
      aria-valuenow={current}
    >
      {steps.map((s, idx) => {
        const isCompleted = s < current;
        const isCurrent = s === current;
        return (
          <div key={s} className="flex items-center gap-2">
            <span
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-200",
                isCurrent && "bg-primary text-primary-foreground",
                isCompleted && "bg-primary/70 text-primary-foreground",
                !isCurrent && !isCompleted && "bg-muted text-muted-foreground"
              )}
            >
              {s}
            </span>
            {idx < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "h-px w-8 transition-colors duration-200",
                  s < current ? "bg-primary/70" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 画像 + ラベルの Card 風セル
 */
function MediaCell({
  src,
  alt,
  label,
  placeholderText,
  onClick,
  ariaLabel,
}: {
  src: string | null;
  alt: string;
  label: string;
  placeholderText?: string;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const inner = src ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-contain"
      loading="lazy"
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
      {placeholderText ?? alt}
    </div>
  );

  return (
    <figure className="space-y-2">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={ariaLabel ?? alt}
          className="block aspect-square w-full overflow-hidden rounded-lg border bg-muted shadow-sm transition hover:opacity-90 hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {inner}
        </button>
      ) : (
        <div className="aspect-square w-full overflow-hidden rounded-lg border bg-muted shadow-sm">
          {inner}
        </div>
      )}
      <figcaption className="text-center text-xs font-medium text-muted-foreground">
        {label}
      </figcaption>
    </figure>
  );
}

/**
 * 申請フォーム（旧 `UserStyleTemplateSubmissionDialog` の中身を専用ページに移植したもの）。
 *
 * モーダルから 1 画面構成に変更したのに伴い、
 * - 外側の `<Dialog>` は削除し、`<section>` ベースの page layout に
 * - 旧「× / 背景クリック / Esc で閉じる」は「キャンセル / 戻るボタンで /my-page へ戻る」に
 * - dirty な状態で離脱しようとしたら AlertDialog で確認（draft の cleanup は変わらず）
 * - 申請成功後は `router.push("/my-page")` で戻る
 */
export function UserStyleTemplateSubmissionForm({
  testCharacterImageUrl,
  replaceTemplateId,
  isCreatorLooksMode = false,
}: UserStyleTemplateSubmissionFormProps) {
  const t = useTranslations("inspireSubmission");
  const { toast } = useToast();
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [pseudoProgress, setPseudoProgress] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewResult, setPreviewResult] =
    useState<PreviewGenerationResponse | null>(null);
  const [previewSignedUrls, setPreviewSignedUrls] = useState<{
    openai?: string;
    gemini?: string;
  }>({});
  const [consent, setConsent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  // Creator Looks 追加 state (= isCreatorLooksMode=true のときだけ意味を持つ)
  const [submissionSource, setSubmissionSource] =
    useState<SubmissionSource | null>(null);
  const [creatorLooksConsents, setCreatorLooksConsents] = useState({
    copyright: false,
    third_party_ip: false,
    secondary_use: false,
    promo_use: false,
    no_sensitive: false,
  });
  // 拡大表示している画像のインデックス（null = 表示なし）。
  // インデックスは下記 enlargeableSlides 配列上の位置を指す。
  const [enlargedIndex, setEnlargedIndex] = useState<number | null>(null);

  // Step 3 で拡大可能な画像の集合（左右ナビ用）。
  // テンプレ → OpenAI → Gemini の順。URL が存在しないものは除外する。
  const enlargeableSlides = useMemo(() => {
    const slides: Array<{ url: string; label: string }> = [];
    if (filePreviewUrl) {
      slides.push({ url: filePreviewUrl, label: t("step3TemplateLabel") });
    }
    if (previewSignedUrls.openai) {
      slides.push({
        url: previewSignedUrls.openai,
        label: t("step3PreviewLabel"),
      });
    }
    if (previewSignedUrls.gemini) {
      slides.push({
        url: previewSignedUrls.gemini,
        label: t("step3PreviewLabelGemini"),
      });
    }
    return slides;
  }, [filePreviewUrl, previewSignedUrls.openai, previewSignedUrls.gemini, t]);

  const openEnlarged = useCallback(
    (url: string) => {
      const idx = enlargeableSlides.findIndex((s) => s.url === url);
      if (idx >= 0) setEnlargedIndex(idx);
    },
    [enlargeableSlides]
  );

  // ObjectURL を unmount 時にも掃除する（旧 Dialog では reset() で掃除していた）。
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  // prefers-reduced-motion を検知（StatusCard のアニメ抑制用）。
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // 生成中は経過時間ベースで擬似プログレスを進める。idle 時は 0 に戻す。
  useEffect(() => {
    if (!generating) {
      setPseudoProgress(0);
      return;
    }
    setPseudoProgress(PSEUDO_INITIAL_PROGRESS);
    const startTime = Date.now();
    const intervalId = window.setInterval(() => {
      const elapsedMs = Date.now() - startTime;
      setPseudoProgress((previous) =>
        Math.max(previous, calculatePseudoProgress(elapsedMs))
      );
    }, 160);
    return () => window.clearInterval(intervalId);
  }, [generating]);

  /**
   * 画面を閉じる（= マイページに戻る）。
   * @param options.deleteDraft - true の場合、draft 行が DB にあればバックグラウンドで削除する。
   *   ユーザーが取り消した場合（キャンセル / 戻る）= true
   *   申請が成功して閉じる場合 = false（既に pending に昇格済みなので消さない）
   */
  const leaveNow = useCallback(
    (options: { deleteDraft: boolean } = { deleteDraft: true }) => {
      const draftId = previewResult?.template_id;
      if (options.deleteDraft && draftId) {
        // fire-and-forget: 失敗しても 24h cleanup cron が拾うので fatal にしない
        fetch(`/api/style-templates/submissions/${draftId}`, {
          method: "DELETE",
        }).catch((err) => {
          console.warn("[submission] background draft delete failed", err);
        });
      }
      router.push("/my-page");
    },
    [previewResult, router]
  );

  const requestLeave = useCallback(() => {
    const hasInput =
      file !== null || alt.length > 0 || previewResult !== null || consent;
    if (!hasInput) {
      leaveNow();
      return;
    }
    setCloseConfirmOpen(true);
  }, [alt, consent, file, leaveNow, previewResult]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setErrorMessage(null);
      const next = event.target.files?.[0] ?? null;
      if (!next) {
        setFile(null);
        if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
        setFilePreviewUrl(null);
        return;
      }
      const lower = next.type.toLowerCase();
      if (!ACCEPTED_MIME.includes(lower)) {
        setErrorMessage(t("submitFailedGeneric"));
        return;
      }
      if (next.size > MAX_FILE_SIZE_BYTES) {
        setErrorMessage(t("submitFailedTooLarge"));
        return;
      }
      setFile(next);
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(URL.createObjectURL(next));
    },
    [filePreviewUrl, t]
  );

  const fetchSignedUrl = useCallback(
    async (templateId: string): Promise<{ openai?: string; gemini?: string }> => {
      try {
        const response = await fetch(
          `/api/style-templates/${templateId}?include_previews=1`
        );
        if (!response.ok) return {};
        const json = (await response.json()) as {
          template?: {
            preview_openai_image_url?: string | null;
            preview_gemini_image_url?: string | null;
          };
        };
        return {
          openai: json.template?.preview_openai_image_url ?? undefined,
          gemini: json.template?.preview_gemini_image_url ?? undefined,
        };
      } catch (err) {
        console.warn("[submission] preview signed url fetch failed", err);
        return {};
      }
    },
    []
  );

  const handleGeneratePreview = useCallback(async () => {
    if (!file) return;
    setGenerating(true);
    setErrorMessage(null);
    try {
      const base64 = await readFileAsBase64(file);

      // Creator Looks モード時は出所申告と同意 5 項目を一緒に送る (= Step 1 で完結)
      // ただし Step 1 段階では consent をまだ取っていないので、ここでは送らず
      // submission (= 申請確定) 時に再度 preview-generation を呼び直す形式は取らない。
      // 代わりに、Creator Looks モード時は Step 1 で source + 5 つの同意も同時に取り、
      // この preview-generation 呼び出し前に validate する。
      const creatorLooksPayload =
        isCreatorLooksMode &&
        submissionSource !== null &&
        isAllConsentsAcknowledged(creatorLooksConsents)
          ? {
              is_creator_looks: true as const,
              submission_source: submissionSource,
              submission_consents: buildSubmissionConsents(
                creatorLooksConsents
              ),
            }
          : {};

      const response = await fetch("/api/style-templates/preview-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          imageMimeType: file.type,
          alt: alt || null,
          ...creatorLooksPayload,
        }),
      });

      if (response.status === 429) {
        setErrorMessage(t("submitFailedRateLimit"));
        return;
      }
      if (response.status === 403) {
        const data = await response.json().catch(() => null);
        if (data?.errorCode === "CREATOR_LOOKS_NOT_ALLOWED") {
          setErrorMessage(t("submitFailedGeneric"));
          return;
        }
      }
      if (response.status === 400) {
        const data = await response.json().catch(() => null);
        if (data?.errorCode === "INSPIRE_SAFETY_BLOCKED") {
          setErrorMessage(t("submitFailedSafety"));
          return;
        }
        if (data?.errorCode === "INSPIRE_IMAGE_TOO_LARGE") {
          setErrorMessage(t("submitFailedTooLarge"));
          return;
        }
        if (
          typeof data?.errorCode === "string" &&
          data.errorCode.startsWith("CREATOR_LOOKS_IMAGE_")
        ) {
          setErrorMessage(t("submitFailedSafety"));
          return;
        }
        setErrorMessage(t("previewFailed"));
        return;
      }
      if (!response.ok) {
        setErrorMessage(t("previewFailed"));
        return;
      }

      const data = (await response.json()) as PreviewGenerationResponse;
      setPreviewResult(data);
      const urls = await fetchSignedUrl(data.template_id);
      setPreviewSignedUrls(urls);
      setStep(3);
    } catch (err) {
      console.error("[submission] preview generation failed", err);
      setErrorMessage(t("previewFailed"));
    } finally {
      setGenerating(false);
    }
  }, [
    alt,
    fetchSignedUrl,
    file,
    t,
    isCreatorLooksMode,
    submissionSource,
    creatorLooksConsents,
  ]);

  /**
   * Creator Looks モード専用の一気通貫送信。
   *
   * 既存 Inspire の Step 2 (preview 生成) / Step 3 (結果確認) は投稿者にとって
   * 不要なため、Step 1 のチェック完了でそのまま「申請する」を押せる UX にする。
   *
   * 内部:
   *   1) preview-generation API を Creator Looks payload で叩く
   *      → サーバ側で preview 生成は skip、draft 行のみ作成して template_id を返す
   *   2) 返ってきた template_id で submissions API を叩いて pending に昇格
   *      → DB Trigger 経由で extract-creator-looks-prompt Edge Function が起動
   *
   * 既存 Inspire の handleGeneratePreview / handleSubmit はこの関数の影響を受けない。
   */
  const handleCreatorLooksSubmit = useCallback(async () => {
    if (!file) return;
    if (submissionSource === null) {
      setErrorMessage(t("submitFailedConsent"));
      return;
    }
    if (!isAllConsentsAcknowledged(creatorLooksConsents)) {
      setErrorMessage(t("submitFailedConsent"));
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const base64 = await readFileAsBase64(file);
      const previewResponse = await fetch(
        "/api/style-templates/preview-generation",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: base64,
            imageMimeType: file.type,
            alt: alt || null,
            is_creator_looks: true,
            submission_source: submissionSource,
            submission_consents: buildSubmissionConsents(creatorLooksConsents),
          }),
        }
      );
      if (previewResponse.status === 429) {
        const data = await previewResponse.json().catch(() => null);
        if (data?.errorCode === "CREATOR_LOOKS_DAILY_CAP_EXCEEDED") {
          setErrorMessage(t("submitFailedCap"));
        } else {
          setErrorMessage(t("submitFailedRateLimit"));
        }
        return;
      }
      if (previewResponse.status === 403) {
        setErrorMessage(t("submitFailedGeneric"));
        return;
      }
      if (previewResponse.status === 400) {
        const data = await previewResponse.json().catch(() => null);
        if (
          typeof data?.errorCode === "string" &&
          data.errorCode.startsWith("CREATOR_LOOKS_IMAGE_")
        ) {
          setErrorMessage(t("submitFailedSafety"));
          return;
        }
        if (data?.errorCode === "INSPIRE_IMAGE_TOO_LARGE") {
          setErrorMessage(t("submitFailedTooLarge"));
          return;
        }
        setErrorMessage(t("submitFailedGeneric"));
        return;
      }
      if (!previewResponse.ok) {
        setErrorMessage(t("submitFailedGeneric"));
        return;
      }
      const previewData = (await previewResponse.json()) as {
        template_id?: string;
      };
      if (!previewData.template_id) {
        setErrorMessage(t("submitFailedGeneric"));
        return;
      }

      // submissions 失敗 + ユーザー離脱で draft が孤立しないよう、
      // template_id を previewResult に保存しておく。
      // これで leaveNow({ deleteDraft: true }) が draft DELETE を呼べる。
      setPreviewResult({
        template_id: previewData.template_id,
        outcome: "success",
        previews: [],
      });

      const submitResponse = await fetch("/api/style-templates/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: previewData.template_id,
          copyrightConsent: true,
        }),
      });
      if (submitResponse.status === 429) {
        setErrorMessage(t("submitFailedCap"));
        return;
      }
      if (!submitResponse.ok) {
        setErrorMessage(t("submitFailedGeneric"));
        return;
      }

      toast({ title: t("submitSuccess") });
      // 申請成功時は draft → pending 昇格済み。leaveNow は draft DELETE を呼ばない。
      leaveNow({ deleteDraft: false });
    } catch (err) {
      console.error("[submission] creator-looks submit failed", err);
      setErrorMessage(t("submitFailedGeneric"));
    } finally {
      setSubmitting(false);
    }
  }, [
    alt,
    creatorLooksConsents,
    file,
    leaveNow,
    setPreviewResult,
    submissionSource,
    t,
    toast,
  ]);

  const handleSubmit = useCallback(async () => {
    if (!previewResult || !consent) {
      setErrorMessage(t("submitFailedConsent"));
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/style-templates/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: previewResult.template_id,
          copyrightConsent: true,
        }),
      });
      if (response.status === 429) {
        setErrorMessage(t("submitFailedCap"));
        return;
      }
      if (!response.ok) {
        setErrorMessage(t("submitFailedGeneric"));
        return;
      }

      toast({ title: t("submitSuccess") });
      // 「再申請」フローの場合は、submit 成功と同時に古い行（rejected/withdrawn）を削除して
      // 上書き挙動とする。fire-and-forget: 失敗してもユーザー操作は完了済みなので無視。
      if (replaceTemplateId) {
        fetch(`/api/style-templates/submissions/${replaceTemplateId}`, {
          method: "DELETE",
        }).catch((err) => {
          console.warn("[submission] replace target delete failed", err);
        });
      }
      // 申請成功時は新しい draft → pending へ昇格済み。新しい行を DELETE してはいけない。
      leaveNow({ deleteDraft: false });
    } catch (err) {
      console.error("[submission] submit failed", err);
      setErrorMessage(t("submitFailedGeneric"));
    } finally {
      setSubmitting(false);
    }
  }, [consent, leaveNow, previewResult, replaceTemplateId, t, toast]);

  return (
    <>
      <section className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">{t("dialogTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("dialogDescription")}</p>
        </header>

        {/*
          Creator Looks モードでは preview を生成せず Step 1 で完結するため、
          3 step インジケータは表示しない。
        */}
        {!isCreatorLooksMode && <StepIndicator current={step} />}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold">{t("step1Title")}</h2>
            <p className="text-sm text-muted-foreground">{t("step1Description")}</p>

            <div className="space-y-2">
              <Label htmlFor="inspire-file">{t("step1FileLabel")}</Label>
              <Input
                id="inspire-file"
                type="file"
                accept={ACCEPTED_MIME.join(",")}
                onChange={handleFileChange}
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">{t("step1FileHint")}</p>
            </div>

            {filePreviewUrl && (
              <div className="overflow-hidden rounded-lg border bg-muted shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={filePreviewUrl}
                  alt="upload preview"
                  className="max-h-64 w-full object-contain"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="inspire-alt">{t("step1AltLabel")}</Label>
              <Textarea
                id="inspire-alt"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                placeholder={t("step1AltPlaceholder")}
                maxLength={200}
                rows={2}
              />
            </div>

            {/*
              Creator Looks モード:
              既存の single consent を hide し、出所申告 + 5 つの同意チェックを表示する。
              CREATOR_LOOKS_ENABLED=false かつ admin/allowlist 外なら isCreatorLooksMode は
              false で渡され、以下の塊は表示されない (= 既存 Inspire 投稿フローは無変更)。
            */}
            {isCreatorLooksMode ? (
              <CreatorLooksConsentBlock
                t={t}
                source={submissionSource}
                onSourceChange={setSubmissionSource}
                consents={creatorLooksConsents}
                onConsentsChange={setCreatorLooksConsents}
              />
            ) : (
              <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3">
                <Checkbox
                  id="inspire-consent"
                  checked={consent}
                  onCheckedChange={(v) => setConsent(v === true)}
                  className="mt-0.5 cursor-pointer"
                />
                <Label
                  htmlFor="inspire-consent"
                  className="cursor-pointer text-xs leading-snug"
                >
                  {t("step3ConsentLabel")}
                </Label>
              </div>
            )}

            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Button type="button" variant="ghost" onClick={requestLeave}>
                {t("cancelButton")}
              </Button>
              {isCreatorLooksMode ? (
                <Button
                  type="button"
                  onClick={handleCreatorLooksSubmit}
                  disabled={
                    !file ||
                    submissionSource === null ||
                    !isAllConsentsAcknowledged(creatorLooksConsents) ||
                    submitting
                  }
                  className="cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2
                        className="mr-1.5 size-4 motion-safe:animate-spin"
                        aria-hidden="true"
                      />
                      {t("submitting")}
                    </>
                  ) : (
                    t("step3SubmitButton")
                  )}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!file || !consent}
                >
                  {t("step1NextButton")}
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 2 && !isCreatorLooksMode && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold">{t("step2Title")}</h2>
            <p className="text-sm text-muted-foreground">{t("step2Description")}</p>

            {/*
              「あなたのテンプレ + テストキャラ」の Before 構造。
              生成中は中央/下部に「生成中…」を別途表示し、placeholder の 3 枚目は出さない。
            */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <MediaCell
                src={filePreviewUrl}
                alt="your template"
                label={t("step2YourTemplateLabel")}
              />
              <div
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <Plus className="size-5" />
              </div>
              <MediaCell
                src={testCharacterImageUrl}
                alt="test character"
                label={t("step2TestCharacterLabel")}
                placeholderText="—"
              />
            </div>

            {generating && (
              <GenerationStatusCard
                title={t("step2GeneratingCardTitle")}
                message={t("step2GeneratingInline")}
                liveMessage={t("step2GeneratingMessage")}
                footerText={t("step2GeneratingCardFooter")}
                progress={pseudoProgress}
                animateFromZeroOnMount
                isComplete={false}
                prefersReducedMotion={prefersReducedMotion}
              />
            )}

            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(1)}
                disabled={generating}
              >
                {t("step2BackButton")}
              </Button>
              <Button
                type="button"
                onClick={handleGeneratePreview}
                disabled={!file || generating}
                className="cursor-pointer"
              >
                {generating ? (
                  <>
                    <Loader2
                      className="mr-1.5 size-4 motion-safe:animate-spin"
                      aria-hidden="true"
                    />
                    {t("step2GeneratingInline")}
                  </>
                ) : (
                  t("step2NextButton")
                )}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && previewResult && !isCreatorLooksMode && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold">{t("step3Title")}</h2>
            <p className="text-sm text-muted-foreground">{t("step3Description")}</p>

            {previewResult.outcome === "partial" && (
              <p
                role="status"
                className="rounded-lg border border-yellow-300 bg-yellow-50 p-2 text-xs text-yellow-900"
              >
                {t("step2PartialNotice")}
              </p>
            )}

            {/* 3-up grid: あなたのテンプレ + OpenAI + Gemini （すべてクリックで拡大） */}
            <div className="grid grid-cols-3 gap-3">
              <MediaCell
                src={filePreviewUrl}
                alt="your template"
                label={t("step3TemplateLabel")}
                onClick={
                  filePreviewUrl ? () => openEnlarged(filePreviewUrl) : undefined
                }
                ariaLabel={t("enlargeImageAriaLabel")}
              />
              <MediaCell
                src={previewSignedUrls.openai ?? null}
                alt="openai preview"
                label={t("step3PreviewLabel")}
                onClick={
                  previewSignedUrls.openai
                    ? () => openEnlarged(previewSignedUrls.openai!)
                    : undefined
                }
                ariaLabel={t("enlargeImageAriaLabel")}
                placeholderText={
                  previewResult.previews.find((p) => p.provider === "openai")
                    ? "(preview saved)"
                    : t("step3PreviewMissing")
                }
              />
              <MediaCell
                src={previewSignedUrls.gemini ?? null}
                alt="gemini preview"
                label={t("step3PreviewLabelGemini")}
                onClick={
                  previewSignedUrls.gemini
                    ? () => openEnlarged(previewSignedUrls.gemini!)
                    : undefined
                }
                ariaLabel={t("enlargeImageAriaLabel")}
                placeholderText={
                  previewResult.previews.find((p) => p.provider === "gemini")
                    ? "(preview saved)"
                    : t("step3PreviewMissing")
                }
              />
            </div>

            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(2)}
                disabled={submitting}
              >
                {t("step3BackButton")}
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!consent || submitting}
              >
                {submitting ? t("submitting") : t("step3SubmitButton")}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* 離脱確認（dirty な状態でキャンセル/戻るしたとき） */}
      <AlertDialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("closeConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("closeConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("closeConfirmCancel")}</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => {
                setCloseConfirmOpen(false);
                leaveNow();
              }}
            >
              {t("closeConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 画像拡大表示（lightbox、prev/next ナビ付き） */}
      <ImageLightboxDialog
        slides={enlargeableSlides}
        index={enlargedIndex}
        onIndexChange={setEnlargedIndex}
        prevLabel={t("enlargedPrev")}
        nextLabel={t("enlargedNext")}
      />
    </>
  );
}

// ===============================================
// Creator Looks 専用: 出所申告 + 5 つの同意チェック UI
// ===============================================
// isCreatorLooksMode=true の Step 1 にのみ表示される。
// 既存 Inspire 投稿フローでは表示されない (= isCreatorLooksMode=false なので render されない)。

type CreatorLooksConsentBlockProps = {
  t: ReturnType<typeof useTranslations>;
  source: SubmissionSource | null;
  onSourceChange: (next: SubmissionSource) => void;
  consents: {
    copyright: boolean;
    third_party_ip: boolean;
    secondary_use: boolean;
    promo_use: boolean;
    no_sensitive: boolean;
  };
  onConsentsChange: (
    updater: (prev: CreatorLooksConsentBlockProps["consents"]) => CreatorLooksConsentBlockProps["consents"]
  ) => void;
};

function CreatorLooksConsentBlock({
  t,
  source,
  onSourceChange,
  consents,
  onConsentsChange,
}: CreatorLooksConsentBlockProps) {
  return (
    <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-primary">
          {t("creatorLooksSectionTitle")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("creatorLooksSectionDescription")}
        </p>
      </div>

      {/* 出所申告 */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          {t("creatorLooksSourceLabel")}
          <span className="ml-1 text-xs text-destructive">*</span>
        </legend>
        <div className="space-y-1.5">
          {SUBMISSION_SOURCES.map((s) => (
            <label
              key={s}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="radio"
                name="creator-looks-source"
                value={s}
                checked={source === s}
                onChange={() => onSourceChange(s)}
                className="cursor-pointer"
              />
              <span>{t(`creatorLooksSource_${s}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* 5 つの同意 */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          {t("creatorLooksConsentsLabel")}
          <span className="ml-1 text-xs text-destructive">*</span>
        </legend>
        {(
          [
            "copyright",
            "third_party_ip",
            "secondary_use",
            "promo_use",
            "no_sensitive",
          ] as const
        ).map((key) => (
          <div key={key} className="flex items-start gap-2">
            <Checkbox
              id={`creator-looks-consent-${key}`}
              checked={consents[key]}
              onCheckedChange={(v) =>
                onConsentsChange((prev) => ({
                  ...prev,
                  [key]: v === true,
                }))
              }
              className="mt-0.5 cursor-pointer"
            />
            <Label
              htmlFor={`creator-looks-consent-${key}`}
              className="cursor-pointer text-xs leading-snug"
            >
              {t(`creatorLooksConsent_${key}`)}
            </Label>
          </div>
        ))}
      </fieldset>
    </div>
  );
}
