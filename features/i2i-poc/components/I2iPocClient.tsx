"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { Maximize2, Minimize2 } from "lucide-react";
import Image from "next/image";
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

const WEBP_QUALITY = 0.8;
const WEBP_QUALITY_STEPS = [0.95, 0.9, 0.85, 0.8] as const;
const WEBP_MIME_TYPE = "image/webp";
const MAX_TURNS = 10;
const FILE_EXTENSION_REGEX = /\.[^.]+$/;
const BASE_FEEDBACK_SUGGESTIONS = [
  "+ 服が変わった為、シーン保持の服になるように修正してください。",
] as const;
const CHARACTER_FEEDBACK_SUGGESTIONS = [
  "体型が変わった為、キャラ保持の体型になるように修正してください。",
] as const;

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

function validateImageType(file: File, label: string): string | null {
  const normalizedType = file.type.toLowerCase().trim();
  if (!ALLOWED_IMAGE_MIME_TYPE_SET.has(normalizedType)) {
    return `${label}は PNG / JPG / WebP のみ対応しています。`;
  }

  return null;
}

function validateImageSize(file: File, label: string): string | null {
  if (file.size > MAX_IMAGE_BYTES) {
    return `${label}は10MB以下にしてください（現在: ${bytesToMbText(file.size)}）。`;
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

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像の読み込みに失敗しました。"));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("画像変換に失敗しました。"));
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
  quality = WEBP_QUALITY
): Promise<File> {
  const image = await loadImageElement(file);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("画像処理コンテキストの取得に失敗しました。");
  }

  context.drawImage(image, 0, 0);

  const webpBlob = await canvasToBlob(canvas, WEBP_MIME_TYPE, quality);
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
  maxAllowedBytes: number
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
    throw new Error(
      "Base画像とCharacter画像の合計サイズが大きすぎるため、再生成できません。"
    );
  }

  if (sourceFile.size <= normalizedMaxBytes) {
    return sourceFile;
  }

  for (const quality of WEBP_QUALITY_STEPS) {
    const candidate = await convertImageToWebpFile(sourceFile, quality);
    if (candidate.size <= normalizedMaxBytes) {
      return candidate;
    }
  }

  throw new Error(
    `生成結果画像を圧縮しても ${bytesToMbText(
      normalizedMaxBytes
    )} 以下にできませんでした。`
  );
}

function formatTimeLabel(isoTime: string): string {
  return new Date(isoTime).toLocaleTimeString("ja-JP", {
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
  const baseInputRef = useRef<HTMLInputElement | null>(null);
  const characterInputRef = useRef<HTMLInputElement | null>(null);
  const [baseImage, setBaseImage] = useState<File | null>(null);
  const [characterImage, setCharacterImage] = useState<File | null>(null);
  const [baseFeedback, setBaseFeedback] = useState("");
  const [characterFeedback, setCharacterFeedback] = useState("");
  const [baseFeedbackSuggestions, setBaseFeedbackSuggestions] = useState<
    readonly string[]
  >(BASE_FEEDBACK_SUGGESTIONS);
  const [characterFeedbackSuggestions, setCharacterFeedbackSuggestions] =
    useState<readonly string[]>(CHARACTER_FEEDBACK_SUGGESTIONS);
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
    return () => {
      revokeTurnImages(turnsRef.current);
    };
  }, []);

  function resetConversationState() {
    revokeTurnImages(turns);
    setTurns([]);
    setBaseFeedback("");
    setCharacterFeedback("");
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

    const label = type === "base" ? "Base画像" : "Character画像";
    const typeError = validateImageType(file, label);
    if (typeError) {
      setErrorMessage(typeError);
      input.value = "";
      return;
    }

    setErrorMessage(null);
    const sizeError = validateImageSize(file, label);
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
      setErrorMessage("Base画像とCharacter画像を両方アップロードしてください。");
      return;
    }

    if (mode === "refine") {
      if (!latestTurn) {
        setErrorMessage("先に初回生成を実行してください。");
        return;
      }
      if (!baseFeedback.trim() && !characterFeedback.trim()) {
        setErrorMessage("不足点をどちらか1つ以上入力してください。");
        return;
      }
    }

    const trimmedBaseFeedback = baseFeedback.trim();
    const trimmedCharacterFeedback = characterFeedback.trim();

    generationRequestLockRef.current = true;
    setErrorMessage(null);
    setIsGenerating(true);

    try {
      const formData = new FormData();
      formData.set("baseImage", baseImage);
      formData.set("characterImage", characterImage);

      if (mode === "refine" && latestTurn) {
        setIsConverting(true);
        try {
          const remainingBytesForResult =
            MAX_TOTAL_IMAGE_BYTES - baseImage.size - characterImage.size;
          const previousResultFile = await buildResultImageForRefine(
            latestTurn.imageBlob,
            remainingBytesForResult
          );
          const resultImageSizeError = validateImageSize(
            previousResultFile,
            "生成結果画像"
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
            : "画像生成に失敗しました。";
        throw new Error(apiError);
      }

      if (
        !payload ||
        typeof payload !== "object" ||
        !("imageDataUrl" in payload) ||
        typeof payload.imageDataUrl !== "string"
      ) {
        throw new Error("画像レスポンスの解析に失敗しました。");
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
          : "不明なエラーが発生しました。";
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
          AI fashion show
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          1枚目の背景・服装・ポーズをそのままに、
          <br />
          2枚目のキャラクターに差し替えて生成します。
          <br />
          あなたのキャラクターで、ファッションショーのようなシーンを楽しめます。
        </p>
        <section
          className={`relative ml-auto mt-6 rounded-xl border border-slate-200 shadow-sm transition-[width,padding] duration-200 ${
            turns.length > 0
              ? "sticky top-3 z-20 bg-white/95 backdrop-blur"
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
                ? "参照カードを元サイズに戻す"
                : "参照カードを縮小する"
            }
            title={isReferenceCardCollapsed ? "戻す" : "縮小"}
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
                  シーン保持
                </p>
                <LabelInfoTooltip
                  content="背景・服装・ポーズを保持します。"
                  ariaLabel="シーン保持の説明を表示"
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
                aria-label="Base画像を選択"
              >
                {basePreviewUrl ? (
                  <Image
                    src={basePreviewUrl}
                    alt="Base画像プレビュー"
                    fill
                    unoptimized
                    className="object-contain"
                  />
                ) : !isReferenceCardCollapsed ? (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500">
                    タップして画像を選択
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
                  キャラ保持
                </p>
                <LabelInfoTooltip
                  content="顔・髪型・体型など、キャラクターの特徴を保持します。"
                  ariaLabel="キャラ保持の説明を表示"
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
                aria-label="Character画像を選択"
              >
                {characterPreviewUrl ? (
                  <Image
                    src={characterPreviewUrl}
                    alt="Character画像プレビュー"
                    fill
                    unoptimized
                    className="object-contain"
                  />
                ) : !isReferenceCardCollapsed ? (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500">
                    タップして画像を選択
                  </div>
                ) : null}
              </button>
            </div>
          </div>
        </section>

        {turns.length === 0 && (
          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => runGeneration("initial")}
                disabled={!baseImage || !characterImage || isGenerating || isConverting}
              >
                {isConverting ? "画像変換中..." : isGenerating ? "生成中..." : "まず生成"}
              </Button>
              <p className="text-xs text-slate-500">
                画像形式: PNG / JPG / WebP。BaseとCharacterは元画像を送信し、再生成参照画像は必要時のみWebP圧縮（品質0.95→0.8）します。
              </p>
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
            <h2 className="text-lg font-semibold text-slate-900">生成履歴</h2>
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
                        Turn {turnNumber}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatTimeLabel(turn.createdAt)}
                      </p>
                    </div>
                    <div className="relative mt-3 aspect-square w-full max-w-[460px] overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                      <Image
                        src={turn.imageUrl}
                        alt={`生成結果 Turn ${turnNumber}`}
                        fill
                        unoptimized
                        className="object-contain"
                      />
                    </div>
                    {turnNumber >= 2 && (turn.baseFeedback || turn.characterFeedback) && (
                      <div className="mt-2 space-y-1 rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                        <p>Base再現不足: {turn.baseFeedback || "（未入力）"}</p>
                        <p>
                          Character再現不足: {turn.characterFeedback || "（未入力）"}
                        </p>
                      </div>
                    )}
                  </article>
                ))}
            </div>
            {latestTurn && (
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">
                  不足点を入力して再生成
                </p>
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-slate-700">
                    Base再現不足（背景/衣装/ポーズ）
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
                    placeholder="例: 背景の看板文字が消えている。ポーズの腕の角度を元画像に近づける。"
                  />
                </div>
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-slate-700">
                    Character再現不足（顔/髪/体型/雰囲気）
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
                    placeholder="例: 参照画像より肩幅が狭い。体型を細めにしつつ、顔の印象と髪型を参照画像に近づける。"
                  />
                </div>
                <div className="mt-4">
                  <Button
                    type="button"
                    onClick={() => runGeneration("refine")}
                    disabled={isGenerating || isConverting}
                  >
                    {isConverting
                      ? "画像変換中..."
                      : isGenerating
                      ? "再生成中..."
                      : "この内容で再生成"}
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
