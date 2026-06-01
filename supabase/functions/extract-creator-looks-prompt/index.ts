// ===============================================
// extract-creator-looks-prompt Edge Function
// ===============================================
// 設計判断: docs/planning/creator-looks-implementation-plan.md REQ-003, ADR-003, ADR-009, ADR-011
//
// 流れ:
//   1. Authorization ヘッダ検証 (Bearer + EDGE_FUNCTION_SECRET)
//   2. body から template_id を取得
//   3. user_style_templates を service_role で SELECT (image_url / storage_path / is_creator_looks)
//   4. 画像の signed URL を取得 → 画像バイナリをダウンロード
//   5. prompt_overrides から `creator_looks.meta_extractor` を取得 (= override > registry default)
//   6. OpenAI Responses API (gpt-5.5) を呼び、meta-prompt + 画像を渡す
//   7. 出力テキストを `user_style_template_secrets` に UPSERT
//   8. 失敗時は最大 3 回まで指数バックオフで retry、最終失敗で audit_logs に extract_failed を記録
//
// 機密扱い (ADR-009 レッドライン):
//   - hidden_prompt は logger に直接出さない (= console.error の引数は redactSecrets を通す)
//   - audit_logs.metadata にも hidden_prompt を入れない
//   - response body には hidden_prompt を含めない (= 成否 + retry 回数のみ)
//
// 起動: pg_net 経由 (= enqueue_creator_looks_extraction RPC)
// 認可: verify_jwt = false (= config.toml)、関数内で EDGE_FUNCTION_SECRET 照合

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  PROMPT_REGISTRY,
} from "../../../shared/generation/prompt-registry.ts";
import {
  parseExtractedPrompt,
  looksLikeValidCreatorLooksPrompt,
} from "./parse-output.ts";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const META_EXTRACTOR_KEY = "creator_looks.meta_extractor";
const GENERATOR_VERSION = "creator-looks-v1.0";
const VLM_MODEL = "gpt-5.5";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const MAX_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 800;
const REQUEST_TIMEOUT_MS = 60_000;

const STORAGE_BUCKET = "style-templates";

// ---------------------------------------------------------------------------
// 機密マスク (= ADR-009)
// Edge Function 用に最小実装。lib/security/redact-secrets.ts と同等のキーリストを持つ。
// (Deno と Next.js で同じ TS ファイルを import するのは構成上難しいため複製している)
// ---------------------------------------------------------------------------

const SENSITIVE_KEY_SUBSTRINGS = [
  "hidden_prompt",
  "extracted_prompt",
  "meta_extractor_output",
  "creator_looks_prompt",
  "authorization",
  "api_key",
  "apikey",
  "secret",
  "password",
  "bearer",
  "service_role",
  "access_token",
  "refresh_token",
  "private_key",
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_SUBSTRINGS.some((sub) => lower.includes(sub));
}

function redactSecrets(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean" || t === "bigint") {
    return value;
  }
  if (t === "function" || t === "symbol") return "[REDACTED]";

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();

  if (typeof value === "object") {
    const obj = value as object;
    if (seen.has(obj)) return "[CIRCULAR]";
    seen.add(obj);
    if (Array.isArray(value)) {
      return value.map((v) => redactSecrets(v, seen));
    }
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = isSensitiveKey(k) ? "[REDACTED]" : redactSecrets(v, seen);
    }
    return result;
  }
  return value;
}

function safeLog(
  level: "info" | "warn" | "error",
  message: string,
  payload?: unknown,
): void {
  const masked = payload === undefined ? undefined : redactSecrets(payload);
  const tag = "[extract-creator-looks-prompt]";
  if (level === "info") console.log(tag, message, masked ?? "");
  else if (level === "warn") console.warn(tag, message, masked ?? "");
  else console.error(tag, message, masked ?? "");
}

// ---------------------------------------------------------------------------
// helper
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isUuid(s: unknown): s is string {
  if (typeof s !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s,
  );
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  // 1. Authorization 検証
  const expectedSecret = Deno.env.get("EDGE_FUNCTION_SECRET");
  if (expectedSecret) {
    const authHeader = req.headers.get("Authorization") || "";
    if (authHeader !== `Bearer ${expectedSecret}`) {
      safeLog("warn", "Authorization mismatch");
      return jsonResponse(401, { error: "unauthorized" });
    }
  } else {
    safeLog(
      "warn",
      "EDGE_FUNCTION_SECRET is not set; allowing request (development only)",
    );
  }

  // 2. body parse
  let templateId: string;
  try {
    const body = await req.json().catch(() => ({}));
    if (!isUuid(body?.template_id)) {
      return jsonResponse(400, { error: "invalid_template_id" });
    }
    templateId = body.template_id;
  } catch {
    return jsonResponse(400, { error: "invalid_body" });
  }

  // 3. Supabase service_role client
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    safeLog("error", "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not set");
    return jsonResponse(500, { error: "server_misconfigured" });
  }
  if (!openaiKey) {
    safeLog("error", "OPENAI_API_KEY is not set");
    return jsonResponse(500, { error: "openai_key_missing" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 4. テンプレ取得
  const { data: template, error: templateError } = await supabase
    .from("user_style_templates")
    .select("id, image_url, storage_path, is_creator_looks")
    .eq("id", templateId)
    .maybeSingle();

  if (templateError) {
    safeLog("error", "failed to load template", { error: templateError });
    return jsonResponse(500, { error: "load_failed" });
  }
  if (!template) {
    return jsonResponse(404, { error: "template_not_found" });
  }
  if (!template.is_creator_looks) {
    return jsonResponse(400, { error: "not_creator_looks" });
  }
  if (!template.storage_path) {
    return jsonResponse(400, { error: "missing_storage_path" });
  }

  // 5. meta-prompt 解決 (override > registry default)
  const metaPrompt = await resolveMetaPrompt(supabase);
  if (!metaPrompt) {
    safeLog("error", "failed to resolve meta_extractor prompt");
    return jsonResponse(500, { error: "meta_prompt_unavailable" });
  }

  // 6. 画像 signed URL
  const { data: signed, error: signedError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(template.storage_path, 600); // 10 分
  if (signedError || !signed?.signedUrl) {
    safeLog("error", "failed to create signed URL", { error: signedError });
    return jsonResponse(500, { error: "signed_url_failed" });
  }

  // 7. retry 付き OpenAI Responses API 呼び出し
  let extractedPrompt: string | null = null;
  let lastError: { code: string; status?: number; message: string } | null =
    null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const candidate = await callResponsesApi({
        openaiKey,
        metaPrompt,
        imageUrl: signed.signedUrl,
      });
      if (candidate && looksLikeValidCreatorLooksPrompt(candidate)) {
        extractedPrompt = candidate;
        break;
      }
      lastError = {
        code: "invalid_output",
        message: "Responses API returned unparseable or malformed output",
      };
    } catch (e) {
      const err = e as Error;
      lastError = { code: "api_error", message: err.message };
      safeLog("warn", `attempt ${attempt} failed`, { error: err });
    }

    if (attempt < MAX_ATTEMPTS) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      await sleep(backoff);
    }
  }

  // 8. 失敗時の処理
  if (!extractedPrompt) {
    // audit_log に記録 (= hidden_prompt は含めない、error.code / message のみ)
    await supabase.from("style_template_audit_logs").insert({
      template_id: templateId,
      actor_id: null,
      action: "extract_failed",
      reason: lastError?.code ?? "unknown",
      metadata: redactSecrets({
        attempts: MAX_ATTEMPTS,
        last_error: lastError,
        generator_version: GENERATOR_VERSION,
        vlm_model: VLM_MODEL,
      }),
    });

    safeLog("error", "extraction permanently failed", {
      template_id: templateId,
      attempts: MAX_ATTEMPTS,
      last_error: lastError,
    });

    return jsonResponse(502, {
      error: "extraction_failed",
      code: lastError?.code ?? "unknown",
      template_id: templateId,
    });
  }

  // 9. UPSERT into secrets
  const { error: upsertError } = await supabase
    .from("user_style_template_secrets")
    .upsert(
      {
        template_id: templateId,
        hidden_prompt: extractedPrompt,
        generator_version: GENERATOR_VERSION,
        vlm_model: VLM_MODEL,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "template_id" },
    );

  if (upsertError) {
    safeLog("error", "failed to upsert secrets", { error: upsertError });
    return jsonResponse(500, { error: "save_failed" });
  }

  safeLog("info", "extraction succeeded", { template_id: templateId });
  return jsonResponse(200, {
    ok: true,
    template_id: templateId,
    generator_version: GENERATOR_VERSION,
    vlm_model: VLM_MODEL,
  });
});

// ---------------------------------------------------------------------------
// helpers (= 上記 handler から呼ばれる)
// ---------------------------------------------------------------------------

// supabase-js client は型が複雑なので unknown 経由で扱う
async function resolveMetaPrompt(
  supabase: ReturnType<typeof createClient>,
): Promise<string | null> {
  // override 優先
  try {
    const { data, error } = await supabase
      .from("prompt_overrides")
      .select("content")
      .eq("prompt_key", META_EXTRACTOR_KEY)
      .maybeSingle();
    if (!error && data?.content && typeof data.content === "string") {
      return data.content;
    }
  } catch {
    // fall through to registry default
  }
  // registry default
  const def = (PROMPT_REGISTRY as Record<string, { defaultContent: string }>)[
    META_EXTRACTOR_KEY
  ];
  return def?.defaultContent ?? null;
}

interface CallResponsesParams {
  openaiKey: string;
  metaPrompt: string;
  imageUrl: string;
}

/**
 * OpenAI Responses API を 1 回呼び、抽出済みプロンプトを取り出す。
 * 失敗時は throw する (= retry は呼出側責任)。
 */
async function callResponsesApi(
  params: CallResponsesParams,
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const requestBody = {
      model: VLM_MODEL,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: params.metaPrompt },
            { type: "input_image", image_url: params.imageUrl },
          ],
        },
      ],
    };

    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.openaiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      // error text に prompt 内容が含まれる可能性があるが、redactSecrets では string 自体は
      // mask できない (= キーベースのため)。message のみ短く切り詰める。
      const trimmed = errorText.slice(0, 500);
      throw new Error(`OpenAI ${response.status}: ${trimmed}`);
    }

    const json = await response.json();
    return parseExtractedPrompt(json);
  } finally {
    clearTimeout(timeoutId);
  }
}
