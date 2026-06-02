/**
 * POST /api/internal/generate-creator-looks-admin-preview
 *
 * Creator Looks 投稿に対し、admin 審査画面で表示する「テストキャラに着せ替えた」preview を
 * OpenAI / Gemini で 2 枚生成し、user_style_templates の preview_*_image_url に保存する。
 *
 * 呼出元:
 *   - DB Trigger (user_style_template_secrets AFTER INSERT) → enqueue RPC → pg_net 経由
 *   - Bearer 認証は Vault `creator_looks_extract_secret` (= Edge Function Secrets `EDGE_FUNCTION_SECRET`)
 *     と同じ値を Vercel env `EDGE_FUNCTION_SECRET` に同期して使う
 *
 * 設計判断: docs/planning/creator-looks-implementation-plan.md (admin preview 追加、案 C 派生)
 *   - 投稿者向け preview は PR #296 で skip 済 (= UX 改善)
 *   - admin の審査判断には preview が必要 (= テンプレ画像だけでは hidden_prompt の効きが分からない)
 *   - 非同期生成: 投稿者は即時申請完了、admin は生成完了を待つ
 *
 * 入力:
 *   - Body: { template_id: UUID }
 *   - Header: Authorization: Bearer <EDGE_FUNCTION_SECRET>
 *
 * 処理:
 *   1. Bearer 認証
 *   2. user_style_template_secrets から hidden_prompt 取得
 *   3. user_style_templates から submitted_by_user_id / is_creator_looks 取得 (= Storage path 構築 + 検証)
 *   4. env INSPIRE_TEST_CHARACTER_IMAGE_URL からテストキャラ画像 fetch
 *   5. OpenAI + Gemini を並列起動 (= 既存 preview-generation handler と同じパターン)
 *   6. 成功した preview を Storage に upsert
 *   7. user_style_templates の preview_*_image_url + preview_generated_at を UPDATE
 *
 * 失敗時:
 *   - hidden_prompt 無し → 404 (= secrets テーブル INSERT 前に誤って呼ばれた可能性)
 *   - 全 provider 失敗 → 500、preview URL は NULL のまま (= admin 画面で空白表示)
 *   - 片方失敗 → partial、成功した分だけ保存
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

const requestSchema = z.object({
  template_id: z.string().uuid(),
});

type ProviderResult =
  | { ok: true; provider: "openai" | "gemini"; storagePath: string }
  | { ok: false; provider: "openai" | "gemini"; error: string };

export async function POST(request: NextRequest) {
  // 1. Bearer 認証
  const expectedSecret = env.EDGE_FUNCTION_SECRET;
  if (!expectedSecret) {
    console.error(
      "[admin-preview] EDGE_FUNCTION_SECRET is not set; refusing request",
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
  const templateId = parsed.data.template_id;

  const adminClient = createAdminClient();

  // 3. hidden_prompt 取得 (= secrets テーブル)
  const { data: secretRow, error: secretError } = await adminClient
    .from("user_style_template_secrets")
    .select("hidden_prompt")
    .eq("template_id", templateId)
    .maybeSingle();
  if (secretError) {
    console.error("[admin-preview] secrets fetch failed", secretError);
    return NextResponse.json({ error: "secret_fetch_failed" }, { status: 500 });
  }
  if (!secretRow?.hidden_prompt) {
    return NextResponse.json(
      { error: "hidden_prompt_not_ready" },
      { status: 404 },
    );
  }
  const hiddenPrompt = secretRow.hidden_prompt;

  // 4. template 行 (= 所有者 + is_creator_looks 検証)
  const { data: template, error: templateError } = await adminClient
    .from("user_style_templates")
    .select("submitted_by_user_id, is_creator_looks")
    .eq("id", templateId)
    .maybeSingle();
  if (templateError || !template) {
    console.error("[admin-preview] template fetch failed", templateError);
    return NextResponse.json({ error: "template_not_found" }, { status: 404 });
  }
  if (template.is_creator_looks !== true) {
    return NextResponse.json({ error: "not_creator_looks" }, { status: 400 });
  }
  const ownerId = template.submitted_by_user_id;

  // 5. テストキャラ画像取得
  const testCharacter = await fetchTestCharacterImage();
  if (!testCharacter) {
    console.error("[admin-preview] test character missing");
    return NextResponse.json(
      { error: "test_character_missing" },
      { status: 500 },
    );
  }

  // 6. OpenAI / Gemini 並列起動
  const openaiPromise: Promise<ProviderResult> = (async () => {
    try {
      const results = await callOpenAIImageEditMultiInput({
        prompt: hiddenPrompt,
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
      const storagePath = `${ownerId}/preview/${templateId}-admin-openai.png`;
      const upload = await uploadBase64ToStorage(
        adminClient,
        storagePath,
        result.data,
        "image/png",
      );
      if (upload.error) {
        return { ok: false, provider: "openai", error: upload.error };
      }
      return { ok: true, provider: "openai", storagePath };
    } catch (err) {
      return {
        ok: false,
        provider: "openai",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  })();

  const geminiPromise: Promise<ProviderResult> = (async () => {
    try {
      if (!GEMINI_GENERATION_ENABLED) {
        return { ok: false, provider: "gemini", error: "gemini_disabled" };
      }
      if (!env.GEMINI_API_KEY) {
        return {
          ok: false,
          provider: "gemini",
          error: "GEMINI_API_KEY is not set",
        };
      }
      const client = createNanobananaClient();
      const testCharacterDims = parseImageDimensions(
        new Uint8Array(Buffer.from(testCharacter.base64, "base64")),
        testCharacter.mimeType,
      );
      const aspectRatio = resolveGeminiAspectRatio(testCharacterDims);
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
                { text: hiddenPrompt },
              ],
            },
          ],
          generationConfig: {
            candidateCount: 1,
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
              imageSize: "512",
              aspectRatio,
            },
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
        part?.inline_data?.mime_type ??
        part?.inlineData?.mimeType ??
        "image/png";
      if (!data) {
        return {
          ok: false,
          provider: "gemini",
          error: "No image returned from Gemini",
        };
      }
      const ext = mimeType.includes("jpeg") ? "jpg" : "png";
      const storagePath = `${ownerId}/preview/${templateId}-admin-gemini.${ext}`;
      const upload = await uploadBase64ToStorage(
        adminClient,
        storagePath,
        data,
        mimeType,
      );
      if (upload.error) {
        return { ok: false, provider: "gemini", error: upload.error };
      }
      return { ok: true, provider: "gemini", storagePath };
    } catch (err) {
      return {
        ok: false,
        provider: "gemini",
        error: sanitizeProviderErrorMessage(
          err instanceof Error ? err.message : String(err),
        ),
      };
    }
  })();

  const [openaiOutcome, geminiOutcome] = await Promise.all([
    openaiPromise,
    geminiPromise,
  ]);

  // 失敗詳細はログだけ残す (= レスポンスには含めず、admin 画面の空白で示す)
  if (!openaiOutcome.ok) {
    console.warn("[admin-preview] openai failed", {
      templateId,
      error: openaiOutcome.error,
    });
  }
  if (!geminiOutcome.ok) {
    console.warn("[admin-preview] gemini failed", {
      templateId,
      error: geminiOutcome.error,
    });
  }

  // 7. preview URL を DB に書き戻す
  const updatePayload: Record<string, string | null> = {
    preview_generated_at: new Date().toISOString(),
  };
  if (openaiOutcome.ok) {
    updatePayload.preview_openai_image_url = openaiOutcome.storagePath;
  }
  if (geminiOutcome.ok) {
    updatePayload.preview_gemini_image_url = geminiOutcome.storagePath;
  }

  const { error: updateError } = await adminClient
    .from("user_style_templates")
    .update(updatePayload)
    .eq("id", templateId);
  if (updateError) {
    console.error("[admin-preview] template update failed", updateError);
    return NextResponse.json(
      { error: "template_update_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: openaiOutcome.ok || geminiOutcome.ok,
    openai_ok: openaiOutcome.ok,
    gemini_ok: geminiOutcome.ok,
  });
}

// ---- inline helpers (= preview-generation handler のロジックを最小流用) ----

async function uploadBase64ToStorage(
  adminClient: ReturnType<typeof createAdminClient>,
  storagePath: string,
  base64: string,
  mimeType: string,
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
        "[admin-preview] test character fetch failed",
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
    console.error("[admin-preview] test character fetch error", err);
    return null;
  }
}
