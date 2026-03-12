import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getI2iPocConfig } from "@/lib/i2i-poc-auth";
import {
  extractImagesFromGeminiResponse,
  type GeminiResponse,
} from "@/features/generation/lib/nanobanana";
import {
  ALLOWED_IMAGE_MIME_TYPE_SET,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
} from "@/features/i2i-poc/shared/image-constraints";

const MODEL_NAME = "gemini-3.1-flash-image-preview";
const OUTPUT_IMAGE_SIZE = "512";
const GEMINI_TIMEOUT_MS = 35_000;
const MAX_FEEDBACK_LENGTH = 600;
const MAX_RETRYABLE_ATTEMPTS = 2;
const RETRYABLE_NO_IMAGE_FINISH_REASONS = new Set([
  "MALFORMED_FUNCTION_CALL",
]);

type GeminiContentPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

interface GenerateRouteContext {
  params: Promise<{
    slug: string;
  }>;
}

interface GeminiPromptFeedback {
  blockReason?: string;
}

interface GeminiErrorPayload {
  error?: {
    message?: string;
  };
}

const SAFETY_BLOCKED_MESSAGE =
  "安全性でブロックされました。画像または指示を調整して再試行してください。";

function getFinishReasons(payload: GeminiResponse | null): string[] {
  if (!payload?.candidates || payload.candidates.length === 0) {
    return [];
  }

  const reasons = payload.candidates
    .map((candidate) => candidate.finishReason?.trim())
    .filter((reason): reason is string => Boolean(reason));

  return Array.from(new Set(reasons));
}

function isSafetyBlockedResponse(payload: GeminiResponse | null): boolean {
  if (!payload) {
    return false;
  }

  const withPromptFeedback = payload as GeminiResponse & {
    promptFeedback?: GeminiPromptFeedback;
  };

  if (typeof withPromptFeedback.promptFeedback?.blockReason === "string") {
    return true;
  }

  if (!payload.candidates || payload.candidates.length === 0) {
    return false;
  }

  const finishReasons = getFinishReasons(payload).map((reason) =>
    reason.toUpperCase()
  );

  return finishReasons.some(
    (reason) =>
      reason.includes("SAFETY") ||
      reason.includes("PROHIBITED") ||
      reason.includes("BLOCKLIST")
  );
}

function shouldRetryNoImageResponse(payload: GeminiResponse | null): boolean {
  const finishReasons = getFinishReasons(payload).map((reason) =>
    reason.toUpperCase()
  );

  return finishReasons.some((reason) =>
    RETRYABLE_NO_IMAGE_FINISH_REASONS.has(reason)
  );
}

function getFile(entry: FormDataEntryValue | null): File | null {
  if (!(entry instanceof File)) {
    return null;
  }
  return entry;
}

function validateImageFile(file: File, label: string): string | null {
  const normalizedType = file.type.toLowerCase().trim();
  if (!ALLOWED_IMAGE_MIME_TYPE_SET.has(normalizedType)) {
    return `${label}は PNG / JPG / WebP のみ対応しています。`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `${label}は10MB以下にしてください。`;
  }
  return null;
}

function trimFeedback(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, MAX_FEEDBACK_LENGTH);
}

async function toInlineData(file: File): Promise<GeminiContentPart> {
  const arrayBuffer = await file.arrayBuffer();
  const data = Buffer.from(arrayBuffer).toString("base64");
  return {
    inline_data: {
      mime_type: file.type,
      data,
    },
  };
}

function buildPrompt(
  baseFeedback: string,
  characterFeedback: string,
  hasDraftResult: boolean
): string {
  const lines: string[] = [
    "タスク: 2枚の参照画像を使った高度な合成（image composition）。",
    "目的: 画像1のシーンを維持しながら、人物を画像2のキャラクター特性に置き換える。",
    "参照優先順位は属性別に適用する。",
    "- シーン属性（背景・衣装デザイン・ポーズ・構図・カメラ・ライティング・色調・線画タッチ・塗り・質感）は画像1を最優先。",
    "- キャラクター属性（顔立ち・髪型・表情・体型・骨格バランス・手足の比率）は画像2を最優先。",
    "役割定義:",
    "- 画像1（base）: 背景・衣装・ポーズ・構図・カメラアングル・ライティング・色調・イラストタッチ（線の太さ、塗り方、陰影、質感）の唯一の基準。",
    "- 画像2（character）: 顔立ち・髪型・表情・体型・骨格バランス・手足比率・キャラクター性の基準。描画タッチは参照しない。",
    "実行手順:",
    "1. 画像1の人物領域のみを特定し、背景や構図は変更しない。",
    "2. 画像1の人物領域に、画像2の顔立ち・髪型・表情・体型・骨格バランス・手足比率・キャラクター性を適用する。",
    "3. 最終描画のタッチ（線の太さ、ブラシ感、塗り、陰影、質感、色の出し方）は必ず画像1に合わせる。画像2のタッチは持ち込まない。",
    "4. 画像1の衣装（デザイン・色・柄・装飾）とポーズは維持しつつ、衣装のシルエット・丈・しわ・フィット感は画像2の体型に合わせて自然に再構成する。",
    "5. 衣装の破綻（体の貫通、不自然な引き伸ばし、左右非対称な崩れ）を避け、解剖学的に自然な体のつながりを維持する。",
    "6. 合成境界を自然に馴染ませ、影・反射・露出・色温度を画像1の環境に合わせる。",
    "7. 画像1が白背景なら、最終画像も白背景を維持する。",
    "品質要件:",
    "- 高解像度・高忠実度で出力する。",
    "- 二重顔、余分な手足、境界のにじみ、不要な文字やロゴを入れない。",
    "- 画像2の背景・衣装デザイン・ポーズ・構図・ライティング・色調・線画タッチ・塗り・質感は使用しない。",
  ];

  if (hasDraftResult) {
    lines.push(
      "再生成モード: 画像3（現在の生成結果）で正しく再現できている部分は保持し、不足点のみを局所修正する。"
    );
  }

  if (baseFeedback) {
    lines.push(`Base再現不足（画像1準拠）の修正指示: ${baseFeedback}`);
  }

  if (characterFeedback) {
    lines.push(`Character再現不足（画像2準拠）の修正指示: ${characterFeedback}`);
  }

  lines.push("出力は最終画像1枚のみ。説明文は不要。");
  return lines.join("\n");
}

export async function POST(request: Request, context: GenerateRouteContext) {
  try {
    const { slug } = await context.params;
    const config = getI2iPocConfig();

    if (!config || slug !== config.slug) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured." },
        { status: 500 }
      );
    }

    const formData = await request.formData();

    const baseImage = getFile(formData.get("baseImage"));
    const characterImage = getFile(formData.get("characterImage"));
    const resultImage = getFile(formData.get("resultImage"));

    if (!baseImage || !characterImage) {
      return NextResponse.json(
        { error: "Base画像とCharacter画像は必須です。" },
        { status: 400 }
      );
    }

    const baseImageError = validateImageFile(baseImage, "Base画像");
    if (baseImageError) {
      return NextResponse.json({ error: baseImageError }, { status: 400 });
    }

    const characterImageError = validateImageFile(characterImage, "Character画像");
    if (characterImageError) {
      return NextResponse.json({ error: characterImageError }, { status: 400 });
    }

    if (resultImage) {
      const resultImageError = validateImageFile(resultImage, "生成結果画像");
      if (resultImageError) {
        return NextResponse.json({ error: resultImageError }, { status: 400 });
      }
    }

    const totalImageSize =
      baseImage.size + characterImage.size + (resultImage?.size ?? 0);
    if (totalImageSize > MAX_TOTAL_IMAGE_BYTES) {
      return NextResponse.json(
        {
          error:
            "画像合計サイズが20MBを超えています。画像を圧縮して再実行してください。",
        },
        { status: 400 }
      );
    }

    const baseFeedback = trimFeedback(formData.get("baseFeedback"));
    const characterFeedback = trimFeedback(formData.get("characterFeedback"));

    const parts: GeminiContentPart[] = [
      {
        text: "画像1（base）: 背景・衣装・ポーズ・構図・カメラ・ライティングを維持する基準画像。",
      },
      await toInlineData(baseImage),
      {
        text: "画像2（character）: 顔立ち・髪型・表情・体型・骨格バランス・手足比率・キャラクター性を参照する画像。背景・衣装デザイン・ポーズ・構図・描画タッチは参照禁止。",
      },
      await toInlineData(characterImage),
    ];
    if (resultImage) {
      parts.push({
        text: "画像3（draft）: 直前の生成結果です。良い部分は保持し、不足点のみ修正してください。",
      });
      parts.push(await toInlineData(resultImage));
    }
    parts.push({
      text: buildPrompt(baseFeedback, characterFeedback, Boolean(resultImage)),
    });

    for (let attempt = 1; attempt <= MAX_RETRYABLE_ATTEMPTS; attempt += 1) {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), GEMINI_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": geminiApiKey,
            },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                candidateCount: 1,
                responseModalities: ["TEXT", "IMAGE"],
                imageConfig: {
                  imageSize: OUTPUT_IMAGE_SIZE,
                },
              },
            }),
            signal: abortController.signal,
          }
        );
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return NextResponse.json(
            { error: "Gemini API request timed out. Please retry." },
            { status: 504 }
          );
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }

      const responsePayload = (await response.json().catch(() => null)) as
        | GeminiResponse
        | GeminiErrorPayload
        | null;
      const geminiPayload = (responsePayload ?? null) as GeminiResponse | null;

      if (!response.ok) {
        const apiErrorMessage =
          responsePayload &&
          typeof responsePayload === "object" &&
          "error" in responsePayload &&
          typeof responsePayload.error?.message === "string"
            ? responsePayload.error.message
            : "Gemini API request failed.";

        if (
          isSafetyBlockedResponse(geminiPayload) ||
          /safety|blocked|block_reason|policy|prohibited/i.test(apiErrorMessage)
        ) {
          return NextResponse.json({ error: SAFETY_BLOCKED_MESSAGE }, { status: 400 });
        }

        return NextResponse.json(
          { error: apiErrorMessage },
          { status: response.status }
        );
      }

      if (isSafetyBlockedResponse(geminiPayload)) {
        return NextResponse.json({ error: SAFETY_BLOCKED_MESSAGE }, { status: 400 });
      }

      const images = extractImagesFromGeminiResponse(
        (geminiPayload ?? {}) as GeminiResponse
      );

      if (images.length > 0) {
        const firstImage = images[0];
        return NextResponse.json({
          imageDataUrl: `data:${firstImage.mimeType};base64,${firstImage.data}`,
          mimeType: firstImage.mimeType,
        });
      }

      const finishReasons = getFinishReasons(geminiPayload);
      const shouldRetry =
        attempt < MAX_RETRYABLE_ATTEMPTS &&
        shouldRetryNoImageResponse(geminiPayload);

      if (shouldRetry) {
        console.warn("I2I generate route: retrying after no-image response", {
          attempt,
          finishReasons,
        });
        continue;
      }

      const finishReasonText =
        finishReasons.length > 0 ? `（finishReason: ${finishReasons.join(", ")}）` : "";

      console.warn("I2I generate route: no image part in Gemini response", {
        finishReasons,
      });

      return NextResponse.json(
        {
          error: `画像が生成されませんでした${finishReasonText}。別の指示で再試行してください。`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: "画像生成に失敗しました。別の指示で再試行してください。" },
      { status: 502 }
    );
  } catch (error) {
    console.error("I2I generate route error", error);
    return NextResponse.json(
      {
        error:
          "サーバー内部でエラーが発生しました。しばらく時間をおいて再試行してください。",
      },
      { status: 500 }
    );
  }
}
