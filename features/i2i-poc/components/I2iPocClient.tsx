"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { Maximize2, Minimize2 } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_IMAGE_MIME_TYPE_SET,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
} from "@/features/i2i-poc/shared/image-constraints";
import { normalizeSourceImage } from "@/features/generation/lib/normalize-source-image";

const WEBP_QUALITY = 0.8;
const WEBP_QUALITY_STEPS = [0.95, 0.9, 0.85, 0.8] as const;
const WEBP_MIME_TYPE = "image/webp";
const MAX_TURNS = 10;
const FILE_EXTENSION_REGEX = /\.[^.]+$/;

interface I2iPocClientProps {
  slug: string;
}

interface GenerationTurn {
  id: string;
  imageUrl: string;
  imageBlob: Blob;
  baseFeedback: string;
  characterFeedback: string;
  createdAt: string;
}

interface GenerateResponse {
  imageDataUrl: string;
  mimeType: string;
}

interface LabelInfoTooltipProps {
  content: string;
  ariaLabel: string;
}

function LabelInfoTooltip({
  content,
  ariaLabel,
}: LabelInfoTooltipProps) {
  return (
    <Tooltip.Provider delayDuration={120} skipDelayDuration={100}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[9px] font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 md:h-3.5 md:w-3.5 md:text-[9px]"
            aria-label={ariaLabel}
          >
            ?
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="end"
            sideOffset={4}
            collisionPadding={8}
            className="z-40 max-w-[11rem] rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] leading-snug text-slate-700 shadow-md"
          >
            {content}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

function bytesToMbText(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function validateImageType(
  file: File,
  label: string,
  unsupportedFormatMessage: (label: string) => string
): string | null {
  const normalizedType = file.type.toLowerCase().trim();
  if (!ALLOWED_IMAGE_MIME_TYPE_SET.has(normalizedType)) {
    return unsupportedFormatMessage(label);
  }

  return null;
}

function validateImageSize(
  file: File,
  label: string,
  fileTooLargeMessage: (label: string, currentSize: string) => string
): string | null {
  if (file.size > MAX_IMAGE_BYTES) {
    return fileTooLargeMessage(label, bytesToMbText(file.size));
  }

  return null;
}

function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => {
    if (!file) {
      return null;
    }
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [url]);

  return url;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

function loadImageElement(
  file: File,
  imageLoadFailedMessage: string
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(imageLoadFailedMessage));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  imageConvertFailedMessage: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(imageConvertFailedMessage));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

async function convertImageToWebpFile(
  file: File,
  messages: {
    imageLoadFailed: string;
    imageConvertFailed: string;
    canvasUnavailable: string;
  },
  quality = WEBP_QUALITY
): Promise<File> {
  const image = await loadImageElement(file, messages.imageLoadFailed);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error(messages.canvasUnavailable);
  }

  context.drawImage(image, 0, 0);

  const webpBlob = await canvasToBlob(
    canvas,
    WEBP_MIME_TYPE,
    messages.imageConvertFailed,
    quality
  );
  const baseName = file.name.replace(FILE_EXTENSION_REGEX, "") || "image";
  return new File([webpBlob], `${baseName}.webp`, {
    type: WEBP_MIME_TYPE,
    lastModified: Date.now(),
  });
}

function getFileExtensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

function revokeTurnImages(turnsToRevoke: GenerationTurn[]) {
  for (const turn of turnsToRevoke) {
    URL.revokeObjectURL(turn.imageUrl);
  }
}

async function buildResultImageForRefine(
  sourceBlob: Blob,
  maxAllowedBytes: number,
  messages: {
    imageLoadFailed: string;
    imageConvertFailed: string;
    canvasUnavailable: string;
    resultTooLargeToRefine: string;
    resultCompressFailed: (size: string) => string;
  }
): Promise<File> {
  const sourceMimeType = sourceBlob.type || "image/png";
  const sourceFile = new File(
    [sourceBlob],
    `result-${Date.now()}.${getFileExtensionFromMimeType(sourceMimeType)}`,
    {
      type: sourceMimeType,
      lastModified: Date.now(),
    }
  );

  const normalizedMaxBytes = Math.min(maxAllowedBytes, MAX_IMAGE_BYTES);
  if (normalizedMaxBytes <= 0) {
    throw new Error(messages.resultTooLargeToRefine);
  }

  if (sourceFile.size <= normalizedMaxBytes) {
    return sourceFile;
  }

  for (const quality of WEBP_QUALITY_STEPS) {
    const candidate = await convertImageToWebpFile(sourceFile, messages, quality);
    if (candidate.size <= normalizedMaxBytes) {
      return candidate;
    }
  }

  throw new Error(messages.resultCompressFailed(bytesToMbText(normalizedMaxBytes)));
}

function formatTimeLabel(isoTime: string, locale: string): string {
  return new Date(isoTime).toLocaleTimeString(locale === "ja" ? "ja-JP" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function appendSuggestion(existingText: string, suggestion: string): string {
  const normalizedSuggestion = suggestion.replace(/^\+\s*/, "");

  if (!existingText.trim()) {
    return normalizedSuggestion;
  }
  if (existingText.includes(normalizedSuggestion)) {
    return existingText;
  }
  const separator = existingText.endsWith("\n") ? "" : "\n";
  return `${existingText}${separator}${normalizedSuggestion}`;
}

export function I2iPocClient({ slug }: I2iPocClientProps) {
  const t = useTranslations("i2iPoc");
  const locale = useLocale();
  const baseInputRef = useRef<HTMLInputElement | null>(null);
  const characterInputRef = useRef<HTMLInputElement | null>(null);
  const initialBaseFeedbackSuggestions = useMemo(
    () => [t("baseSuggestion")] as const,
    [t]
  );
  const initialCharacterFeedbackSuggestions = useMemo(
    () => [t("characterSuggestion")] as const,
    [t]
  );
  const [baseImage, setBaseImage] = useState<File | null>(null);
  const [characterImage, setCharacterImage] = useState<File | null>(null);
  const [baseFeedback, setBaseFeedback] = useState("");
  const [characterFeedback, setCharacterFeedback] = useState("");
  const [baseFeedbackSuggestions, setBaseFeedbackSuggestions] = useState<
    readonly string[]
  >(initialBaseFeedbackSuggestions);
  const [characterFeedbackSuggestions, setCharacterFeedbackSuggestions] =
    useState<readonly string[]>(initialCharacterFeedbackSuggestions);
  const [turns, setTurns] = useState<GenerationTurn[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReferenceCardCollapsed, setIsReferenceCardCollapsed] = useState(false);
  const turnsRef = useRef<GenerationTurn[]>([]);
  const generationRequestLockRef = useRef(false);

  const basePreviewUrl = useObjectUrl(baseImage);
  const characterPreviewUrl = useObjectUrl(characterImage);
  const latestTurn = turns.length > 0 ? turns[turns.length - 1] : null;

  const acceptedMimeTypes = useMemo(
    () => ALLOWED_IMAGE_MIME_TYPES.join(","),
    []
  );

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  useEffect(() => {
    setBaseFeedbackSuggestions(initialBaseFeedbackSuggestions);
    setCharacterFeedbackSuggestions(initialCharacterFeedbackSuggestions);
  }, [initialBaseFeedbackSuggestions, initialCharacterFeedbackSuggestions]);

  useEffect(() => {
    return () => {
      revokeTurnImages(turnsRef.current);
    };
  }, []);

  const baseImageLabel = t("baseImageLabel");
  const characterImageLabel = t("characterImageLabel");
  const resultImageLabel = t("resultImageLabel");

  function resetConversationState() {
    revokeTurnImages(turns);
    setTurns([]);
    setBaseFeedback("");
    setCharacterFeedback("");
    setBaseFeedbackSuggestions(initialBaseFeedbackSuggestions);
    setCharacterFeedbackSuggestions(initialCharacterFeedbackSuggestions);
  }

  async function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
    type: "base" | "character"
  ) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const label = type === "base" ? baseImageLabel : characterImageLabel;
    const typeError = validateImageType(file, label, (imageLabel) =>
      t("unsupportedFormat", { label: imageLabel })
    );
    if (typeError) {
      setErrorMessage(typeError);
      input.value = "";
      return;
    }

    setErrorMessage(null);
    const sizeError = validateImageSize(file, label, (imageLabel, size) =>
      t("imageTooLarge", { label: imageLabel, size })
    );
    if (sizeError) {
      setErrorMessage(sizeError);
      input.value = "";
      return;
    }

    if (type === "base") {
      setBaseImage(file);
    } else {
      setCharacterImage(file);
    }
    if (turns.length > 0) {
      resetConversationState();
    }
    input.value = "";
  }

  async function runGeneration(mode: "initial" | "refine") {
    if (generationRequestLockRef.current) {
      return;
    }

    if (!baseImage || !characterImage) {
      setErrorMessage(t("missingImages"));
      return;
    }

    if (mode === "refine") {
      if (!latestTurn) {
        setErrorMessage(t("initialGenerationRequired"));
        return;
      }
      if (!baseFeedback.trim() && !characterFeedback.trim()) {
        setErrorMessage(t("missingRefineFeedback"));
        return;
      }
    }

    const trimmedBaseFeedback = baseFeedback.trim();
    const trimmedCharacterFeedback = characterFeedback.trim();

    generationRequestLockRef.current = true;
    setErrorMessage(null);
    setIsGenerating(true);

    try {
      const [normalizedBaseImage, normalizedCharacterImage] = await Promise.all([
        normalizeSourceImage(baseImage),
        normalizeSourceImage(characterImage),
      ]);

      const formData = new FormData();
      formData.set("baseImage", normalizedBaseImage);
      formData.set("characterImage", normalizedCharacterImage);

      if (mode === "refine" && latestTurn) {
        setIsConverting(true);
        try {
          const remainingBytesForResult =
            MAX_TOTAL_IMAGE_BYTES - baseImage.size - characterImage.size;
          const previousResultFile = await buildResultImageForRefine(
            latestTurn.imageBlob,
            remainingBytesForResult,
            {
              imageLoadFailed: t("imageLoadFailed"),
              imageConvertFailed: t("imageConvertFailed"),
              canvasUnavailable: t("canvasUnavailable"),
              resultTooLargeToRefine: t("resultTooLargeToRefine"),
              resultCompressFailed: (size) =>
                t("resultCompressFailed", { size }),
            }
          );
          const resultImageSizeError = validateImageSize(
            previousResultFile,
            resultImageLabel,
            (imageLabel, size) =>
              t("imageTooLarge", { label: imageLabel, size })
          );
          if (resultImageSizeError) {
            throw new Error(resultImageSizeError);
          }
          formData.set("resultImage", previousResultFile);
          formData.set("baseFeedback", trimmedBaseFeedback);
          formData.set("characterFeedback", trimmedCharacterFeedback);
        } finally {
          setIsConverting(false);
        }
      }

      const response = await fetch(`/i2i/${encodeURIComponent(slug)}/generate`, {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | GenerateResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        const apiError =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : t("generationFailed");
        throw new Error(apiError);
      }

      if (
        !payload ||
        typeof payload !== "object" ||
        !("imageDataUrl" in payload) ||
        typeof payload.imageDataUrl !== "string"
      ) {
        throw new Error(t("responseParseFailed"));
      }

      const generatedImageBlob = await dataUrlToBlob(payload.imageDataUrl);
      const generatedImageUrl = URL.createObjectURL(generatedImageBlob);

      const nextTurn: GenerationTurn = {
        id: crypto.randomUUID(),
        imageUrl: generatedImageUrl,
        imageBlob: generatedImageBlob,
        baseFeedback: mode === "refine" ? trimmedBaseFeedback : "",
        characterFeedback: mode === "refine" ? trimmedCharacterFeedback : "",
        createdAt: new Date().toISOString(),
      };

      setTurns((previous) => {
        const withNext = [...previous, nextTurn];
        const overflowCount = Math.max(0, withNext.length - MAX_TURNS);
        if (overflowCount === 0) {
          return withNext;
        }
        const turnsToRevoke = withNext.slice(0, overflowCount);
        revokeTurnImages(turnsToRevoke);
        return withNext.slice(overflowCount);
      });
      setBaseFeedback("");
      setCharacterFeedback("");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("unknownError");
      setErrorMessage(message);
    } finally {
      generationRequestLockRef.current = false;
      setIsGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-10">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {t("descriptionLine1")}
          <br />
          {t("descriptionLine2")}
          <br />
          {t("descriptionLine3")}
        </p>
        <section
          className={`relative ml-auto mt-6 rounded-xl border border-slate-200 shadow-sm transition-[width,padding] duration-200 ${
            turns.length > 0
              ? "sticky top-[calc(var(--app-header-height,64px)+0.5rem)] z-20 bg-white/95 backdrop-blur"
              : "bg-white"
          } ${isReferenceCardCollapsed ? "w-[50%] p-2" : "w-full p-4"}`}
        >
          <button
            type="button"
            onClick={() => setIsReferenceCardCollapsed((previous) => !previous)}
            className={`absolute z-30 inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white/90 text-slate-700 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 ${
              isReferenceCardCollapsed ? "right-1 top-1" : "right-2 top-2"
            }`}
            aria-label={
              isReferenceCardCollapsed
                ? t("expandReferenceCardAria")
                : t("collapseReferenceCardAria")
            }
            title={
              isReferenceCardCollapsed
                ? t("expandReferenceCardTitle")
                : t("collapseReferenceCardTitle")
            }
          >
            {isReferenceCardCollapsed ? (
              <Maximize2 size={12} aria-hidden="true" />
            ) : (
              <Minimize2 size={12} aria-hidden="true" />
            )}
          </button>
          <div
            className={`grid grid-cols-2 ${
              isReferenceCardCollapsed ? "gap-1 md:gap-1" : "gap-3 md:gap-4"
            }`}
          >
            <div
              className={`min-w-0 ${
                isReferenceCardCollapsed ? "space-y-1" : "space-y-2"
              }`}
            >
              <div className="flex items-center gap-1">
                <p
                  className={`font-medium text-slate-900 ${
                    isReferenceCardCollapsed ? "text-xs leading-none" : "text-sm"
                  }`}
                >
                  {t("baseReferenceTitle")}
                </p>
                <LabelInfoTooltip
                  content={t("baseReferenceTooltip")}
                  ariaLabel={t("baseReferenceTooltipAria")}
                />
              </div>
              <input
                ref={baseInputRef}
                type="file"
                accept={acceptedMimeTypes}
                onChange={(event) => {
                  void handleFileChange(event, "base");
                }}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => baseInputRef.current?.click()}
                disabled={isConverting || isGenerating}
                className="relative block aspect-square w-full overflow-hidden rounded-md border border-slate-200 bg-slate-100 text-left transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                aria-label={t("baseImageSelectAria")}
              >
                {basePreviewUrl ? (
                  <Image
                    src={basePreviewUrl}
                    alt={t("baseImagePreviewAlt")}
                    fill
                    unoptimized
                    className="object-contain"
                  />
                ) : !isReferenceCardCollapsed ? (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500">
                    {t("tapToSelect")}
                  </div>
                ) : null}
              </button>
            </div>

            <div
              className={`min-w-0 ${
                isReferenceCardCollapsed ? "space-y-1" : "space-y-2"
              }`}
            >
              <div className="flex items-center gap-1">
                <p
                  className={`font-medium text-slate-900 ${
                    isReferenceCardCollapsed ? "text-xs leading-none" : "text-sm"
                  }`}
                >
                  {t("characterReferenceTitle")}
                </p>
                <LabelInfoTooltip
                  content={t("characterReferenceTooltip")}
                  ariaLabel={t("characterReferenceTooltipAria")}
                />
              </div>
              <input
                ref={characterInputRef}
                type="file"
                accept={acceptedMimeTypes}
                onChange={(event) => {
                  void handleFileChange(event, "character");
                }}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => characterInputRef.current?.click()}
                disabled={isConverting || isGenerating}
                className="relative block aspect-square w-full overflow-hidden rounded-md border border-slate-200 bg-slate-100 text-left transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                aria-label={t("characterImageSelectAria")}
              >
                {characterPreviewUrl ? (
                  <Image
                    src={characterPreviewUrl}
                    alt={t("characterImagePreviewAlt")}
                    fill
                    unoptimized
                    className="object-contain"
                  />
                ) : !isReferenceCardCollapsed ? (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500">
                    {t("tapToSelect")}
                  </div>
                ) : null}
              </button>
            </div>
          </div>
        </section>

        {turns.length === 0 && (
          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mt-4">
              <Button
                type="button"
                onClick={() => runGeneration("initial")}
                disabled={!baseImage || !characterImage || isGenerating || isConverting}
              >
                {isConverting
                  ? t("converting")
                  : isGenerating
                    ? t("generating")
                    : t("generateButton")}
              </Button>
              <p className="mt-2 text-xs text-slate-500">{t("supportedFormats")}</p>
            </div>
          </section>
        )}

        {errorMessage && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        {turns.length > 0 && (
          <section className="mt-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">
              {t("historyTitle")}
            </h2>
            <div className="space-y-3">
              {turns
                .map((turn, index) => ({ turn, turnNumber: index + 1 }))
                .map(({ turn, turnNumber }) => (
                  <article
                    key={turn.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">
                        {t("turnLabel", { turn: turnNumber })}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatTimeLabel(turn.createdAt, locale)}
                      </p>
                    </div>
                    <div className="relative mt-3 aspect-square w-full max-w-[460px] overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                      <Image
                        src={turn.imageUrl}
                        alt={t("generatedResultAlt", { turn: turnNumber })}
                        fill
                        unoptimized
                        className="object-contain"
                      />
                    </div>
                    {turnNumber >= 2 && (turn.baseFeedback || turn.characterFeedback) && (
                      <div className="mt-2 space-y-1 rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                        <p>
                          {t("baseFeedbackSummary", {
                            text: turn.baseFeedback || t("feedbackEmpty"),
                          })}
                        </p>
                        <p>
                          {t("characterFeedbackSummary", {
                            text: turn.characterFeedback || t("feedbackEmpty"),
                          })}
                        </p>
                      </div>
                    )}
                  </article>
                ))}
            </div>
            {latestTurn && (
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">
                  {t("refineTitle")}
                </p>
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-slate-700">
                    {t("baseFeedbackTitle")}
                  </p>
                  {baseFeedbackSuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {baseFeedbackSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => {
                            setBaseFeedback((previous) =>
                              appendSuggestion(previous, suggestion)
                            );
                            setBaseFeedbackSuggestions((previous) =>
                              previous.filter((item) => item !== suggestion)
                            );
                          }}
                          disabled={isGenerating || isConverting}
                          className="rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-left text-[11px] leading-snug text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                  <Textarea
                    value={baseFeedback}
                    onChange={(event) => setBaseFeedback(event.target.value)}
                    placeholder={t("baseFeedbackPlaceholder")}
                  />
                </div>
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-slate-700">
                    {t("characterFeedbackTitle")}
                  </p>
                  {characterFeedbackSuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {characterFeedbackSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => {
                            setCharacterFeedback((previous) =>
                              appendSuggestion(previous, suggestion)
                            );
                            setCharacterFeedbackSuggestions((previous) =>
                              previous.filter((item) => item !== suggestion)
                            );
                          }}
                          disabled={isGenerating || isConverting}
                          className="rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-left text-[11px] leading-snug text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                  <Textarea
                    value={characterFeedback}
                    onChange={(event) => setCharacterFeedback(event.target.value)}
                    placeholder={t("characterFeedbackPlaceholder")}
                  />
                </div>
                <div className="mt-4">
                  <Button
                    type="button"
                    onClick={() => runGeneration("refine")}
                    disabled={isGenerating || isConverting}
                  >
                    {isConverting
                      ? t("converting")
                      : isGenerating
                        ? t("refineGenerating")
                        : t("refineSubmit")}
                  </Button>
                </div>
              </article>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
