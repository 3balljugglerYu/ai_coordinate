"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
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
      // strip data:...;base64,
      const stripped = result.replace(/^data:[^;]+;base64,/, "");
      resolve(stripped);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function UserStyleTemplateSubmissionDialog({
  open,
  onOpenChange,
  onSubmissionSucceeded,
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
  }, [filePreviewUrl]);

  const handleClose = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

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
      // テンプレ詳細 API は visible のみ返すため、preview 用の signed URL は admin 経由が必要。
      // 申請者本人は user_style_templates RLS で SELECT 可能なので、storage_path から自前で
      // signed URL を発行する API を別途用意すべきだが、MVP では preview の Storage パスを
      // そのまま使い、画像は表示しない（Phase 4/5 で改善）。
      void templateId;
      return {};
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

      toast({
        title: t("submitSuccess"),
      });
      onSubmissionSucceeded?.();
      handleClose(false);
    } catch (err) {
      console.error("[submission] submit failed", err);
      setErrorMessage(t("submitFailedGeneric"));
    } finally {
      setSubmitting(false);
    }
  }, [consent, handleClose, onSubmissionSucceeded, previewResult, t, toast]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold">{t("step1Title")}</h3>
            <p className="text-sm text-muted-foreground">{t("step1Description")}</p>

            <div className="space-y-2">
              <Label htmlFor="inspire-file">{t("step1FileLabel")}</Label>
              <Input
                id="inspire-file"
                type="file"
                accept={ACCEPTED_MIME.join(",")}
                onChange={handleFileChange}
              />
              <p className="text-xs text-muted-foreground">{t("step1FileHint")}</p>
            </div>

            {filePreviewUrl && (
              <div className="overflow-hidden rounded-md border bg-muted">
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

            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}

            <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Button variant="ghost" onClick={() => handleClose(false)}>
                {t("cancelButton")}
              </Button>
              <Button
                onClick={() => setStep(2)}
                disabled={!file}
              >
                {t("step1NextButton")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold">{t("step2Title")}</h3>
            <p className="text-sm text-muted-foreground">{t("step2Description")}</p>

            <div className="flex h-40 items-center justify-center rounded-md border bg-muted">
              {generating ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">{t("step2GeneratingMessage")}</span>
                </div>
              ) : (
                <Button onClick={handleGeneratePreview} disabled={!file}>
                  {t("step1NextButton")}
                </Button>
              )}
            </div>

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
                variant="ghost"
                onClick={() => handleClose(false)}
                disabled={generating}
              >
                {t("cancelButton")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && previewResult && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold">{t("step3Title")}</h3>
            <p className="text-sm text-muted-foreground">{t("step3Description")}</p>

            {previewResult.outcome === "partial" && (
              <p className="rounded-md border border-yellow-300 bg-yellow-50 p-2 text-xs text-yellow-900">
                {t("step2PartialNotice")}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <p className="text-xs font-medium">{t("step3PreviewLabel")}</p>
                {previewSignedUrls.openai ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={previewSignedUrls.openai}
                    alt="openai preview"
                    className="aspect-square w-full rounded-md border object-cover"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
                    {previewResult.previews.find((p) => p.provider === "openai")
                      ? "(preview saved)"
                      : t("step3PreviewMissing")}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium">{t("step3PreviewLabelGemini")}</p>
                {previewSignedUrls.gemini ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={previewSignedUrls.gemini}
                    alt="gemini preview"
                    className="aspect-square w-full rounded-md border object-cover"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
                    {previewResult.previews.find((p) => p.provider === "gemini")
                      ? "(preview saved)"
                      : t("step3PreviewMissing")}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="inspire-consent"
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
              />
              <Label
                htmlFor="inspire-consent"
                className="text-xs leading-snug"
              >
                {t("step3ConsentLabel")}
              </Label>
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
  );
}
