/**
 * POST /api/style-templates/preview-generation
 *
 * 申請者がアップロードしたテンプレ画像を受け取り、運営テストキャラ画像と組み合わせて
 * OpenAI gpt-image-2-low 1 枚 + Gemini 0.5K 1 枚を並列同期生成し、結果を返す。
 *
 * REQ-S-01〜S-05 / REQ-S-11 / ADR-003 / ADR-004 / ADR-009 参照。
 *
 * 流れ:
 *   1. 認証 + ホワイトリスト検証
 *   2. レートリミット検証（24h で 10 回まで）
 *   3. テンプレ画像を受け取り（base64）→ Storage アップロード
 *   4. draft 行を RPC で作成、image_url / storage_path を更新
 *   5. テストキャラ画像を env から取得（fetch して base64 化）
 *   6. OpenAI / Gemini を並列起動（Promise.allSettled）
 *   7. 各成功プレビューを Storage にアップロードし、draft 行に URL を設定
 *   8. preview_attempts に試行ログを記録
 *   9. 結果を返却（partial 成功時は partial フラグ付き）
 *
 * 全失敗時は draft 行を削除し、Storage からアップロード済テンプレを削除する。
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser, isInspireSubmitterAllowed } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { env, isInspireFeatureEnabled } from "@/lib/env";
import { getInspireRouteCopy } from "@/features/inspire/lib/route-copy";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";
import {
  convertHeicBase64ToJpeg,
  isHeicImage,
} from "@/features/generation/lib/heic-converter";
import { getSafeExtensionFromMimeType } from "@/features/generation/lib/schema";
import { callOpenAIImageEditMultiInput } from "@/features/generation/lib/openai-image";
import { createNanobananaClient } from "@/features/generation/lib/nanobanana-client";
import { buildInspirePrompt } from "@/shared/generation/prompt-core";
import { SAFETY_POLICY_BLOCKED_ERROR } from "@/shared/generation/errors";

const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
const RATE_LIMIT_WINDOW_HOURS = 24;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const OPENAI_TIMEOUT_MS = 90_000;

const previewSchema = z.object({
  imageBase64: z.string().min(1),
  imageMimeType: z
    .string()
    .min(1)
    .refine((val) => {
      const lower = val.toLowerCase().trim();
      return [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "image/heic",
        "image/heif",
      ].includes(lower);
    }),
  alt: z.string().max(200).optional().nullable(),
});

interface PreviewSuccess {
  provider: "openai" | "gemini";
  storagePath: string;
}

interface PreviewFailure {
  provider: "openai" | "gemini";
  errorMessage: string;
  isSafetyBlocked: boolean;
}

type PreviewOutcome = PreviewSuccess | PreviewFailure;

function isSuccess(outcome: PreviewOutcome): outcome is PreviewSuccess {
  return "storagePath" in outcome;
}

async function uploadBase64ToStorage(
  adminClient: ReturnType<typeof createAdminClient>,
  storagePath: string,
  base64: string,
  mimeType: string
): Promise<{ error: string | null }> {
  const buffer = Buffer.from(base64, "base64");
  const { error } = await adminClient.storage
    .from("style-templates")
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: true,
    });
  return { error: error ? error.message : null };
}

async function fetchTestCharacterImage(): Promise<{
  base64: string;
  mimeType: string;
} | null> {
  const url = env.INSPIRE_TEST_CHARACTER_IMAGE_URL;
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        "[preview-generation] test character fetch failed",
        response.status
      );
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType =
      response.headers.get("content-type")?.split(";")[0] ?? "image/png";
    return { base64, mimeType };
  } catch (err) {
    console.error("[preview-generation] test character fetch error", err);
    return null;
  }
}

export async function handlePreviewGeneration(
  request: NextRequest
): Promise<NextResponse> {
  const copy = getInspireRouteCopy(getRouteLocale(request));

  if (!isInspireFeatureEnabled()) {
    return jsonError(copy.notConfigured, "INSPIRE_DISABLED", 404);
  }

  const user = await getUser();
  if (!user) {
    return jsonError(copy.authRequired, "INSPIRE_AUTH_REQUIRED", 401);
  }
  if (!isInspireSubmitterAllowed(user.id)) {
    return jsonError(
      copy.submitterNotAllowed,
      "INSPIRE_SUBMISSION_NOT_ALLOWED",
      403
    );
  }

  const adminClient = createAdminClient();

  // レートリミット
  const since = new Date(
    Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();
  const { count: recentAttempts, error: rateLimitError } = await adminClient
    .from("user_style_template_preview_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("attempted_at", since);

  if (rateLimitError) {
    console.error("[preview-generation] rate limit query failed", rateLimitError);
    return jsonError(
      copy.templateGenerationFailed,
      "INSPIRE_RATE_LIMIT_QUERY_FAILED",
      500
    );
  }

  if ((recentAttempts ?? 0) >= RATE_LIMIT_MAX_ATTEMPTS) {
    await adminClient.from("user_style_template_preview_attempts").insert({
      user_id: user.id,
      outcome: "rate_limited",
    });
    return jsonError(copy.rateLimitDaily, "INSPIRE_RATE_LIMITED", 429);
  }

  // テストキャラ画像
  const testCharacter = await fetchTestCharacterImage();
  if (!testCharacter) {
    return jsonError(
      copy.testCharacterMissing,
      "INSPIRE_TEST_CHARACTER_MISSING",
      500
    );
  }

  // 入力検証
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(copy.invalidRequest, "INSPIRE_INVALID_REQUEST", 400);
  }
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      copy.sourceImageInvalidFormat,
      "INSPIRE_INVALID_REQUEST",
      400
    );
  }

  // base64 を素のデータに正規化（HEIC は JPEG 変換）
  let templateBase64 = parsed.data.imageBase64.replace(/^data:.+;base64,/, "");
  let templateMimeType = parsed.data.imageMimeType;
  let templateExtension: string;

  const estimatedBytes = Math.floor((templateBase64.length * 3) / 4);
  if (estimatedBytes > MAX_SOURCE_IMAGE_BYTES) {
    return jsonError(copy.sourceImageTooLarge, "INSPIRE_IMAGE_TOO_LARGE", 400);
  }

  if (isHeicImage(templateMimeType)) {
    try {
      const converted = await convertHeicBase64ToJpeg(templateBase64, 0.9);
      templateBase64 = converted.base64;
      templateMimeType = converted.mimeType;
      templateExtension = "jpg";
    } catch {
      return jsonError(
        copy.sourceImageInvalidFormat,
        "INSPIRE_HEIC_CONVERSION_FAILED",
        400
      );
    }
  } else {
    templateExtension = getSafeExtensionFromMimeType(templateMimeType);
  }

  // draft 作成
  const { data: draftId, error: draftError } = await adminClient.rpc(
    "create_user_style_template_draft",
    {
      p_actor_id: user.id,
      p_alt: parsed.data.alt ?? null,
    }
  );
  if (draftError || !draftId) {
    console.error("[preview-generation] draft create failed", draftError);
    return jsonError(
      copy.templateGenerationFailed,
      "INSPIRE_DRAFT_CREATE_FAILED",
      500
    );
  }

  const templateStoragePath = `${user.id}/${draftId}.${templateExtension}`;

  // テンプレ画像を Storage にアップロード
  const uploadResult = await uploadBase64ToStorage(
    adminClient,
    templateStoragePath,
    templateBase64,
    templateMimeType
  );
  if (uploadResult.error) {
    console.error("[preview-generation] template upload failed", uploadResult.error);
    // draft 行を削除（孤立行回避）
    await adminClient.from("user_style_templates").delete().eq("id", draftId);
    return jsonError(
      copy.templateGenerationFailed,
      "INSPIRE_TEMPLATE_UPLOAD_FAILED",
      500
    );
  }

  // draft 行に image_url / storage_path を設定
  // image_url は Storage REST のパス文字列（Storage 直叩きの内部 URL）。
  // 公開時には API 層で署名 URL を発行する想定。
  await adminClient
    .from("user_style_templates")
    .update({
      image_url: templateStoragePath,
      storage_path: templateStoragePath,
    })
    .eq("id", draftId);

  // OpenAI と Gemini を並列起動
  const inspirePrompt = buildInspirePrompt({
    overrideTarget: null,
    sourceImageType: "illustration",
  });

  const openaiPromise: Promise<PreviewOutcome> = (async () => {
    try {
      const results = await callOpenAIImageEditMultiInput({
        prompt: inspirePrompt,
        inputImages: [
          { base64: testCharacter.base64, mimeType: testCharacter.mimeType },
          { base64: templateBase64, mimeType: templateMimeType },
        ],
        targetSizeBaseIndex: 1,
        timeoutMs: OPENAI_TIMEOUT_MS,
        n: 1,
      });
      const result = results[0];
      const previewPath = `${user.id}/preview/${draftId}-openai.png`;
      const upload = await uploadBase64ToStorage(
        adminClient,
        previewPath,
        result.data,
        "image/png"
      );
      if (upload.error) {
        return {
          provider: "openai",
          errorMessage: upload.error,
          isSafetyBlocked: false,
        };
      }
      return { provider: "openai", storagePath: previewPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        provider: "openai",
        errorMessage: message,
        isSafetyBlocked: message.includes(SAFETY_POLICY_BLOCKED_ERROR),
      };
    }
  })();

  const geminiPromise: Promise<PreviewOutcome> = (async () => {
    try {
      if (!env.GEMINI_API_KEY) {
        return {
          provider: "gemini",
          errorMessage: "GEMINI_API_KEY is not configured",
          isSafetyBlocked: false,
        };
      }
      const client = createNanobananaClient();
      const response = await client.generateContent({
        apiKey: env.GEMINI_API_KEY,
        model: "gemini-3.1-flash-image-preview",
        body: {
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: testCharacter.mimeType,
                    data: testCharacter.base64,
                  },
                },
                {
                  inline_data: {
                    mime_type: templateMimeType,
                    data: templateBase64,
                  },
                },
                { text: inspirePrompt },
              ],
            },
          ],
          generationConfig: {
            candidateCount: 1,
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: { imageSize: "512" },
          },
        },
      });
      if (!response.ok) {
        const text = await response.text();
        return {
          provider: "gemini",
          errorMessage: `Gemini HTTP ${response.status}: ${text.slice(0, 300)}`,
          isSafetyBlocked: /safety/i.test(text),
        };
      }
      const json = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              inline_data?: { mime_type?: string; data?: string };
              inlineData?: { mimeType?: string; data?: string };
            }>;
          };
        }>;
      };
      const part = json.candidates?.[0]?.content?.parts?.find(
        (p) =>
          (p.inline_data?.data && p.inline_data?.mime_type) ||
          (p.inlineData?.data && p.inlineData?.mimeType)
      );
      const data = part?.inline_data?.data ?? part?.inlineData?.data;
      const mimeType =
        part?.inline_data?.mime_type ?? part?.inlineData?.mimeType ?? "image/png";
      if (!data) {
        return {
          provider: "gemini",
          errorMessage: "No image returned from Gemini",
          isSafetyBlocked: false,
        };
      }
      const previewPath = `${user.id}/preview/${draftId}-gemini.${
        mimeType.includes("jpeg") ? "jpg" : "png"
      }`;
      const upload = await uploadBase64ToStorage(
        adminClient,
        previewPath,
        data,
        mimeType
      );
      if (upload.error) {
        return {
          provider: "gemini",
          errorMessage: upload.error,
          isSafetyBlocked: false,
        };
      }
      return { provider: "gemini", storagePath: previewPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        provider: "gemini",
        errorMessage: message,
        isSafetyBlocked: false,
      };
    }
  })();

  const [openaiOutcome, geminiOutcome] = await Promise.all([
    openaiPromise,
    geminiPromise,
  ]);

  const successes: PreviewSuccess[] = [];
  for (const outcome of [openaiOutcome, geminiOutcome]) {
    if (isSuccess(outcome)) successes.push(outcome);
  }

  // 全失敗 → draft + Storage オブジェクトを削除して 500
  if (successes.length === 0) {
    await adminClient.storage
      .from("style-templates")
      .remove([templateStoragePath]);
    await adminClient.from("user_style_templates").delete().eq("id", draftId);
    await adminClient.from("user_style_template_preview_attempts").insert({
      user_id: user.id,
      outcome: "failed",
    });

    const isSafety =
      (!isSuccess(openaiOutcome) && openaiOutcome.isSafetyBlocked) ||
      (!isSuccess(geminiOutcome) && geminiOutcome.isSafetyBlocked);
    return jsonError(
      isSafety ? copy.safetyBlocked : copy.templateGenerationFailed,
      isSafety ? "INSPIRE_SAFETY_BLOCKED" : "INSPIRE_PREVIEW_FAILED",
      isSafety ? 400 : 500
    );
  }

  // draft 行に preview URL を設定
  const updatePayload: Record<string, string | null> = {
    preview_generated_at: new Date().toISOString(),
  };
  for (const s of successes) {
    if (s.provider === "openai") updatePayload.preview_openai_image_url = s.storagePath;
    if (s.provider === "gemini") updatePayload.preview_gemini_image_url = s.storagePath;
  }

  await adminClient
    .from("user_style_templates")
    .update(updatePayload)
    .eq("id", draftId);

  await adminClient.from("user_style_template_preview_attempts").insert({
    user_id: user.id,
    outcome: successes.length === 2 ? "success" : "partial",
  });

  return NextResponse.json({
    template_id: draftId,
    outcome: successes.length === 2 ? "success" : "partial",
    previews: successes.map((s) => ({
      provider: s.provider,
      storage_path: s.storagePath,
    })),
  });
}
