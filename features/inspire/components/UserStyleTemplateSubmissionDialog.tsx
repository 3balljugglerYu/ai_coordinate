"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

interface PreviewSummary {
  provider: "openai" | "gemini";
  storage_path: string;
}

interface PreviewGenerationResponse {
  template_id: string;
  outcome: "success" | "partial";
  previews: PreviewSummary[];
}

interface UserStyleTemplateSubmissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmissionSucceeded?: () => void;
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
 * 上部の Step indicator (1 / 2 / 3 ドット + 接続線 + ラベル)
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

export function UserStyleTemplateSubmissionDialog({
  open,
  onOpenChange,
  onSubmissionSucceeded,
  testCharacterImageUrl,
  replaceTemplateId,
}: UserStyleTemplateSubmissionDialogProps) {
  const t = useTranslations("inspireSubmission");
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [generating, setGenerating] = useState(false);
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
  // 拡大表示している画像のインデックス（null = 表示なし）。
  // インデックスは下記 enlargeableSlides 配列上の位置を指す。
  const [enlargedIndex, setEnlargedIndex] = useState<number | null>(null);

  const reset = useCallback(() => {
    setStep(1);
    setFile(null);
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setFilePreviewUrl(null);
    setAlt("");
    setGenerating(false);
    setSubmitting(false);
    setPreviewResult(null);
    setPreviewSignedUrls({});
    setConsent(false);
    setErrorMessage(null);
    setEnlargedIndex(null);
  }, [filePreviewUrl]);

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

  const goPrev = useCallback(() => {
    setEnlargedIndex((current) => {
      if (current === null) return null;
      if (enlargeableSlides.length === 0) return null;
      return (current - 1 + enlargeableSlides.length) % enlargeableSlides.length;
    });
  }, [enlargeableSlides.length]);

  const goNext = useCallback(() => {
    setEnlargedIndex((current) => {
      if (current === null) return null;
      if (enlargeableSlides.length === 0) return null;
      return (current + 1) % enlargeableSlides.length;
    });
  }, [enlargeableSlides.length]);

  // キーボードナビ: 拡大表示中の ← / →
  useEffect(() => {
    if (enlargedIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enlargedIndex, goPrev, goNext]);

  /**
   * ダイアログを閉じる。
   * @param options.deleteDraft - true の場合、draft 行が DB にあればバックグラウンドで削除する。
   *   ユーザーが取り消した場合（× / キャンセル / ESC / 背景クリック）= true
   *   申請が成功して閉じる場合 = false（既に pending に昇格済みなので消さない）
   */
  const closeNow = useCallback(
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
      reset();
      onOpenChange(false);
    },
    [onOpenChange, previewResult, reset]
  );

  const requestClose = useCallback(() => {
    const hasInput =
      file !== null ||
      alt.length > 0 ||
      previewResult !== null ||
      consent;
    if (!hasInput) {
      closeNow();
      return;
    }
    setCloseConfirmOpen(true);
  }, [alt, closeNow, consent, file, previewResult]);

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
      const response = await fetch("/api/style-templates/preview-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          imageMimeType: file.type,
          alt: alt || null,
        }),
      });

      if (response.status === 429) {
        setErrorMessage(t("submitFailedRateLimit"));
        return;
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
  }, [alt, fetchSignedUrl, file, t]);

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
      onSubmissionSucceeded?.();
      // 申請成功時は新しい draft → pending へ昇格済み。新しい行を DELETE してはいけない。
      closeNow({ deleteDraft: false });
    } catch (err) {
      console.error("[submission] submit failed", err);
      setErrorMessage(t("submitFailedGeneric"));
    } finally {
      setSubmitting(false);
    }
  }, [
    closeNow,
    consent,
    onSubmissionSucceeded,
    previewResult,
    replaceTemplateId,
    t,
    toast,
  ]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            requestClose();
            return;
          }
          onOpenChange(next);
        }}
      >
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => {
            e.preventDefault();
            requestClose();
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            requestClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>

          <StepIndicator current={step} />

          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold">{t("step1Title")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("step1Description")}
              </p>

              <div className="space-y-2">
                <Label htmlFor="inspire-file">{t("step1FileLabel")}</Label>
                <Input
                  id="inspire-file"
                  type="file"
                  accept={ACCEPTED_MIME.join(",")}
                  onChange={handleFileChange}
                  className="cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">
                  {t("step1FileHint")}
                </p>
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

              {errorMessage && (
                <p className="text-sm text-destructive">{errorMessage}</p>
              )}

              <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <Button variant="ghost" onClick={requestClose}>
                  {t("cancelButton")}
                </Button>
                <Button
                  onClick={() => setStep(2)}
                  disabled={!file || !consent}
                >
                  {t("step1NextButton")}
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold">{t("step2Title")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("step2Description")}
              </p>

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
                <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 py-3 text-sm text-muted-foreground">
                  <Loader2
                    className="size-4 motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                  <span>{t("step2GeneratingMessage")}</span>
                </div>
              )}

              {errorMessage && (
                <p className="text-sm text-destructive">{errorMessage}</p>
              )}

              <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <Button
                  variant="ghost"
                  onClick={() => setStep(1)}
                  disabled={generating}
                >
                  {t("step2BackButton")}
                </Button>
                <Button
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
              </DialogFooter>
            </div>
          )}

          {step === 3 && previewResult && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold">{t("step3Title")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("step3Description")}
              </p>

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

              <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <Button
                  variant="ghost"
                  onClick={() => setStep(2)}
                  disabled={submitting}
                >
                  {t("step3BackButton")}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!consent || submitting}
                >
                  {submitting ? t("submitting") : t("step3SubmitButton")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 閉じる確認ダイアログ */}
      <AlertDialog
        open={closeConfirmOpen}
        onOpenChange={setCloseConfirmOpen}
      >
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
              onClick={() => {
                setCloseConfirmOpen(false);
                closeNow();
              }}
            >
              {t("closeConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 画像拡大表示（lightbox、prev/next ナビ付き） */}
      <Dialog
        open={enlargedIndex !== null}
        onOpenChange={(next) => {
          if (!next) setEnlargedIndex(null);
        }}
      >
        <DialogContent className="max-w-4xl bg-black/95 p-2 sm:p-4">
          {enlargedIndex !== null && enlargeableSlides[enlargedIndex] && (
            <div className="relative flex max-h-[85vh] flex-col items-center justify-center">
              {/* prev/next ボタン（slide が 2 枚以上のときだけ表示） */}
              {enlargeableSlides.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    aria-label={t("enlargedPrev")}
                    className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white shadow-md transition hover:bg-white/20 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:p-3"
                  >
                    <ChevronLeft
                      aria-hidden="true"
                      className="size-6 sm:size-8"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    aria-label={t("enlargedNext")}
                    className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white shadow-md transition hover:bg-white/20 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:p-3"
                  >
                    <ChevronRight
                      aria-hidden="true"
                      className="size-6 sm:size-8"
                    />
                  </button>
                </>
              )}

              {/* 画像本体 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={enlargeableSlides[enlargedIndex].url}
                alt={enlargeableSlides[enlargedIndex].label}
                className="max-h-[80vh] w-auto max-w-full object-contain"
              />

              {/* 下部にラベル + ページ番号 */}
              <div className="mt-2 flex items-center justify-center gap-3 text-xs text-white/80">
                <span className="font-medium">
                  {enlargeableSlides[enlargedIndex].label}
                </span>
                {enlargeableSlides.length > 1 && (
                  <span aria-hidden="true">·</span>
                )}
                {enlargeableSlides.length > 1 && (
                  <span className="tabular-nums">
                    {enlargedIndex + 1} / {enlargeableSlides.length}
                  </span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
