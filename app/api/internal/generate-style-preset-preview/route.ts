/**
 * POST /api/internal/generate-style-preset-preview
 *
 * クリエイター提供プロンプト(pending の style_preset)に対し、admin 審査用 preview を
 * 運営テストキャラ画像 + styling_prompt で生成し、style_presets の preview_*_image_url に保存する。
 * 対応モデル(target_providers)に含まれる provider のみ生成する。
 *
 * 呼出元: DB Trigger(style_presets INSERT で status=pending かつ submitted_by_user_id あり)
 *   → enqueue_creator_style_preset_preview RPC → pg_net 経由。
 * Bearer 認証は既存 admin-preview と同じ Vault `creator_looks_extract_secret`
 *   (= Vercel env EDGE_FUNCTION_SECRET)。
 *
 * 設計: docs/planning/creator-prompt-submission-plan.md(Phase 3、admin-preview を流用)。
 *   styling_prompt は公開 read で除外済(秘匿)。preview 画像は admin 専用列に保存し公開 summary には出ない。
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import {
  callOpenAIImageEditMultiInput,
  parseImageDimensions,
} from "@/features/generation/lib/openai-image";
import { createNanobananaClient } from "@/features/generation/lib/nanobanana-client";
import { resolveGeminiAspectRatio } from "@/shared/generation/gemini-aspect-ratio";
import { GEMINI_GENERATION_ENABLED } from "@/features/generation/lib/model-config";
import { sanitizeProviderErrorMessage } from "@/shared/generation/errors";

const OPENAI_TIMEOUT_MS = 90_000;
// プレビューは公開サムネと同じ style_presets バケット(public)に保存する。
// プレビューは「運営テストキャラがスタイルを着た」画像で、秘匿対象の styling_prompt は
// 含まれない。アクセスは UUID×UUID パスに依存(公開サムネと同方針)。
const PREVIEW_BUCKET = "style_presets";

const requestSchema = z.object({
  preset_id: z.string().uuid(),
});

type ProviderResult =
  | { ok: true; provider: "openai" | "gemini"; publicUrl: string }
  | { ok: false; provider: "openai" | "gemini"; error: string };

export async function POST(request: NextRequest) {
  // 1. Bearer 認証
  const expectedSecret = env.EDGE_FUNCTION_SECRET;
  if (!expectedSecret) {
    console.error(
      "[style-preset-preview] EDGE_FUNCTION_SECRET is not set; refusing request",
    );
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }
  const authHeader = request.headers.get("Authorization") || "";
  if (authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. body parse
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const presetId = parsed.data.preset_id;

  const adminClient = createAdminClient();

  // 3. style_preset 取得(クリエイター提供 = submitted_by_user_id あり、のみ対象)
  const { data: preset, error: presetError } = await adminClient
    .from("style_presets")
    .select("styling_prompt, submitted_by_user_id, target_providers, status")
    .eq("id", presetId)
    .maybeSingle();
  if (presetError || !preset) {
    console.error("[style-preset-preview] preset fetch failed", presetError);
    return NextResponse.json({ error: "preset_not_found" }, { status: 404 });
  }
  if (!preset.submitted_by_user_id) {
    return NextResponse.json({ error: "not_creator_submission" }, { status: 400 });
  }
  // pending のみ対象(RPC/トリガと整合)。published/rejected/draft の再生成・上書きを防ぐ。
  if (preset.status !== "pending") {
    return NextResponse.json({ error: "not_pending" }, { status: 409 });
  }
  if (!preset.styling_prompt) {
    return NextResponse.json({ error: "styling_prompt_missing" }, { status: 404 });
  }
  const ownerId = preset.submitted_by_user_id as string;
  const stylingPrompt = preset.styling_prompt as string;
  // 空配列は「両方」フォールバックしない(意図が空=生成なしと区別)。空なら 400 で観測可能に。
  const targetProviders: string[] = Array.isArray(preset.target_providers)
    ? (preset.target_providers as string[])
    : ["openai", "gemini"];
  if (targetProviders.length === 0) {
    return NextResponse.json({ error: "no_target_providers" }, { status: 400 });
  }

  // 4. テストキャラ画像取得
  const testCharacter = await fetchTestCharacterImage();
  if (!testCharacter) {
    console.error("[style-preset-preview] test character missing");
    return NextResponse.json({ error: "test_character_missing" }, { status: 500 });
  }

  // 5. 選択された provider のみ並列起動
  const wantOpenai = targetProviders.includes("openai");
  const wantGemini = targetProviders.includes("gemini");

  const openaiPromise: Promise<ProviderResult | null> = wantOpenai
    ? (async () => {
        try {
          const results = await callOpenAIImageEditMultiInput({
            prompt: stylingPrompt,
            inputImages: [
              { base64: testCharacter.base64, mimeType: testCharacter.mimeType },
            ],
            targetSizeBaseIndex: 0,
            timeoutMs: OPENAI_TIMEOUT_MS,
            n: 1,
            quality: "low",
            sizeTier: "1k",
          });
          const result = results[0];
          const storagePath = `${ownerId}/preview/${presetId}-openai.png`;
          const upload = await uploadBase64ToStorage(
            adminClient,
            storagePath,
            result.data,
            "image/png",
          );
          if (upload.error || !upload.publicUrl) {
            return { ok: false, provider: "openai", error: upload.error ?? "no_url" };
          }
          return { ok: true, provider: "openai", publicUrl: upload.publicUrl };
        } catch (err) {
          return {
            ok: false,
            provider: "openai",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })()
    : Promise.resolve(null);

  const geminiPromise: Promise<ProviderResult | null> = wantGemini
    ? (async () => {
        try {
          if (!GEMINI_GENERATION_ENABLED) {
            return { ok: false, provider: "gemini", error: "gemini_disabled" };
          }
          if (!env.GEMINI_API_KEY) {
            return { ok: false, provider: "gemini", error: "GEMINI_API_KEY is not set" };
          }
          const client = createNanobananaClient();
          const dims = parseImageDimensions(
            new Uint8Array(Buffer.from(testCharacter.base64, "base64")),
            testCharacter.mimeType,
          );
          const aspectRatio = resolveGeminiAspectRatio(dims);
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
                    { text: stylingPrompt },
                  ],
                },
              ],
              generationConfig: {
                candidateCount: 1,
                responseModalities: ["TEXT", "IMAGE"],
                imageConfig: { imageSize: "512", aspectRatio },
              },
            },
          });
          if (!response.ok) {
            const text = await response.text();
            return {
              ok: false,
              provider: "gemini",
              error: `Gemini HTTP ${response.status}: ${sanitizeProviderErrorMessage(text).slice(0, 300)}`,
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
              (p.inlineData?.data && p.inlineData?.mimeType),
          );
          const data = part?.inline_data?.data ?? part?.inlineData?.data;
          const mimeType =
            part?.inline_data?.mime_type ?? part?.inlineData?.mimeType ?? "image/png";
          if (!data) {
            return { ok: false, provider: "gemini", error: "No image returned from Gemini" };
          }
          const ext = mimeType.includes("jpeg") ? "jpg" : "png";
          const storagePath = `${ownerId}/preview/${presetId}-gemini.${ext}`;
          const upload = await uploadBase64ToStorage(
            adminClient,
            storagePath,
            data,
            mimeType,
          );
          if (upload.error || !upload.publicUrl) {
            return { ok: false, provider: "gemini", error: upload.error ?? "no_url" };
          }
          return { ok: true, provider: "gemini", publicUrl: upload.publicUrl };
        } catch (err) {
          return {
            ok: false,
            provider: "gemini",
            error: sanitizeProviderErrorMessage(
              err instanceof Error ? err.message : String(err),
            ),
          };
        }
      })()
    : Promise.resolve(null);

  const [openaiOutcome, geminiOutcome] = await Promise.all([
    openaiPromise,
    geminiPromise,
  ]);

  if (openaiOutcome && !openaiOutcome.ok) {
    console.warn("[style-preset-preview] openai failed", {
      presetId,
      error: openaiOutcome.error,
    });
  }
  if (geminiOutcome && !geminiOutcome.ok) {
    console.warn("[style-preset-preview] gemini failed", {
      presetId,
      error: geminiOutcome.error,
    });
  }

  // 6. preview URL を DB に書き戻す(選択 provider 分のみ。失敗は NULL のまま=admin 画面で空白)
  const updatePayload: Record<string, string | null> = {};
  if (openaiOutcome?.ok) {
    updatePayload.preview_openai_image_url = openaiOutcome.publicUrl;
  }
  if (geminiOutcome?.ok) {
    updatePayload.preview_gemini_image_url = geminiOutcome.publicUrl;
  }

  if (Object.keys(updatePayload).length > 0) {
    const { error: updateError } = await adminClient
      .from("style_presets")
      .update(updatePayload)
      .eq("id", presetId);
    if (updateError) {
      console.error("[style-preset-preview] preset update failed", updateError);
      return NextResponse.json({ error: "preset_update_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: Boolean(openaiOutcome?.ok || geminiOutcome?.ok),
    openai_ok: Boolean(openaiOutcome?.ok),
    gemini_ok: Boolean(geminiOutcome?.ok),
  });
}

// ---- helpers ----

async function uploadBase64ToStorage(
  adminClient: ReturnType<typeof createAdminClient>,
  storagePath: string,
  base64: string,
  mimeType: string,
): Promise<{ error: string | null; publicUrl: string | null }> {
  const buffer = Buffer.from(base64, "base64");
  const { data, error } = await adminClient.storage
    .from(PREVIEW_BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: true });
  if (error) {
    return { error: error.message, publicUrl: null };
  }
  const {
    data: { publicUrl },
  } = adminClient.storage.from(PREVIEW_BUCKET).getPublicUrl(data.path);
  return { error: null, publicUrl };
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
        "[style-preset-preview] test character fetch failed",
        response.status,
      );
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType =
      response.headers.get("content-type")?.split(";")[0] ?? "image/png";
    return { base64, mimeType };
  } catch (err) {
    console.error("[style-preset-preview] test character fetch error", err);
    return null;
  }
}
