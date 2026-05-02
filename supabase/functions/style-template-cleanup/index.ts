// ===============================================
// style-template-cleanup Edge Function
// ===============================================
// 24 時間以上経過した user_style_templates の draft 行と
// 関連する Storage オブジェクトを削除する。
//
// 起動: pg_cron が 1 時間ごとに net.http_post で叩く（migration 20260502120500 参照）。
// 認可: verify_jwt = false（config.toml）+ 関数内で CRON_SECRET を Authorization ヘッダ照合（ADR-011）。
// 冪等性: Storage 削除 → DB 削除 順。途中失敗時は次回起動時に同じ行を再度拾う。

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const STORAGE_BUCKET = "style-templates";
const STALE_THRESHOLD_HOURS = 24;
const BATCH_SIZE = 100;

interface DraftRow {
  id: string;
  storage_path: string | null;
  preview_openai_image_url: string | null;
  preview_gemini_image_url: string | null;
}

/**
 * Supabase Storage の signed URL / public URL から bucket 内のオブジェクトパスを抽出する。
 * 想定フォーマット:
 *   https://<project>.supabase.co/storage/v1/object/sign/<bucket>/<path>?token=...
 *   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
 *   https://<project>.supabase.co/storage/v1/object/<bucket>/<path>
 * いずれにも該当しない値は null を返す（既に Storage に存在しない可能性あり）。
 */
function extractStoragePath(url: string | null, bucket: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    // segs 例: ["storage","v1","object","sign","style-templates","user/uuid.png"]
    const bucketIdx = segs.findIndex((s) => s === bucket);
    if (bucketIdx === -1 || bucketIdx === segs.length - 1) return null;
    return segs.slice(bucketIdx + 1).join("/");
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  // CRON_SECRET 認証（ADR-011: verify_jwt=false の上に 2 層目）
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const authHeader = req.headers.get("Authorization") || "";
    const expected = `Bearer ${cronSecret}`;
    if (authHeader !== expected) {
      console.warn("[style-template-cleanup] Authorization mismatch");
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
  } else {
    console.warn(
      "[style-template-cleanup] CRON_SECRET is not set; running without header check (development only)",
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[style-template-cleanup] Missing SUPABASE_URL or SERVICE_ROLE_KEY");
    return new Response(
      JSON.stringify({ error: "missing_env", message: "SUPABASE_URL and SERVICE_ROLE_KEY are required" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const cutoffIso = new Date(
    Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000,
  ).toISOString();

  // 24h 以上経過した draft 行を取得
  const { data: drafts, error: selectError } = await supabase
    .from("user_style_templates")
    .select("id, storage_path, preview_openai_image_url, preview_gemini_image_url")
    .eq("moderation_status", "draft")
    .lt("created_at", cutoffIso)
    .limit(BATCH_SIZE);

  if (selectError) {
    console.error("[style-template-cleanup] SELECT failed", selectError);
    return new Response(
      JSON.stringify({ error: "select_failed", message: selectError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const targets = (drafts ?? []) as DraftRow[];

  if (targets.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, deleted_rows: 0, deleted_objects: 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // Storage のパス候補を収集（重複排除）
  const pathsToRemove = new Set<string>();
  for (const row of targets) {
    if (row.storage_path) {
      pathsToRemove.add(row.storage_path);
    }
    const previewOpenAIPath = extractStoragePath(row.preview_openai_image_url, STORAGE_BUCKET);
    if (previewOpenAIPath) pathsToRemove.add(previewOpenAIPath);
    const previewGeminiPath = extractStoragePath(row.preview_gemini_image_url, STORAGE_BUCKET);
    if (previewGeminiPath) pathsToRemove.add(previewGeminiPath);
  }

  let deletedObjects = 0;
  if (pathsToRemove.size > 0) {
    const { data: removed, error: removeError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(Array.from(pathsToRemove));

    if (removeError) {
      // Storage 失敗時は DB 行を残し、次回再試行（冪等）
      console.error("[style-template-cleanup] Storage remove failed", {
        error: removeError.message,
        attempted: pathsToRemove.size,
      });
      return new Response(
        JSON.stringify({
          error: "storage_remove_failed",
          message: removeError.message,
          attempted: pathsToRemove.size,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    deletedObjects = removed?.length ?? 0;
  }

  // DB 行削除
  const idsToDelete = targets.map((t) => t.id);
  const { error: deleteError } = await supabase
    .from("user_style_templates")
    .delete()
    .in("id", idsToDelete);

  if (deleteError) {
    console.error("[style-template-cleanup] DB delete failed", deleteError);
    return new Response(
      JSON.stringify({
        error: "db_delete_failed",
        message: deleteError.message,
        deleted_objects: deletedObjects,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log("[style-template-cleanup] success", {
    deleted_rows: idsToDelete.length,
    deleted_objects: deletedObjects,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      deleted_rows: idsToDelete.length,
      deleted_objects: deletedObjects,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
