// ===============================================
// cleanup-temp-images Edge Function
// ===============================================
// generated-images バケット内の `temp/` 配下で 24 時間以上経過したオブジェクトを削除する。
//
// 通常時、image-gen-worker が生成完了後に Before 画像を `pre-generation/` に永続化し、
// その瞬間に temp/ ファイルも同期削除するため、temp/ にはほぼ何も残らない。
// 本 cron は worker が temp 削除に失敗した場合の orphan 安全網（β: 24h TTL）。
//
// 起動: pg_cron が 1 日 1 回 net.http_post で叩く
//        （migration 20260503120100_schedule_cleanup_temp_images_cron.sql 参照）。
// 認可: verify_jwt = false（config.toml）+ 関数内で TEMP_IMAGE_CLEANUP_CRON_SECRET を
//        Authorization ヘッダ照合。漏洩時の被害範囲を本機能のみに限定するため
//        既存 CRON_SECRET 系とは別 secret を使う（最小権限原則、style-template-cleanup と同思想）。
// 冪等性: Storage 削除のみで完結（DB 連動なし）。失敗時は次回起動で再試行。
// ページング: 大量バックログを 1 回の実行で消化するため、対象が空になるか
//            安全上限（SAFE_MAX_BATCHES * BATCH_SIZE）に達するまでループする。

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const STORAGE_BUCKET = "generated-images";
const STALE_THRESHOLD_HOURS = 24;
const BATCH_SIZE = 1000;
// 1 回の関数呼び出しで処理する batch の安全上限（誤動作時の暴走防止）
// 1000 件/batch * 50 batch = 50,000 件まで吸収可能
const SAFE_MAX_BATCHES = 50;

interface ObjectRow {
  name: string;
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("TEMP_IMAGE_CLEANUP_CRON_SECRET");
  if (cronSecret) {
    const authHeader = req.headers.get("Authorization") || "";
    const expected = `Bearer ${cronSecret}`;
    if (authHeader !== expected) {
      console.warn("[cleanup-temp-images] Authorization mismatch");
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
  } else {
    console.warn(
      "[cleanup-temp-images] TEMP_IMAGE_CLEANUP_CRON_SECRET is not set; running without header check (development only)",
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[cleanup-temp-images] Missing SUPABASE_URL or SERVICE_ROLE_KEY");
    return new Response(
      JSON.stringify({ error: "missing_env", message: "SUPABASE_URL and SERVICE_ROLE_KEY are required" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let totalDeleted = 0;
  let batches = 0;
  let truncated = false;

  const cutoffIso = new Date(
    Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000,
  ).toISOString();

  while (batches < SAFE_MAX_BATCHES) {
    // storage.list は再帰非対応 + ページング困難なため、storage.objects テーブルを直接 SELECT
    const { data: rows, error: selectError } = await supabase
      .schema("storage")
      .from("objects")
      .select("name")
      .eq("bucket_id", STORAGE_BUCKET)
      .like("name", "temp/%")
      .lt("created_at", cutoffIso)
      .limit(BATCH_SIZE);

    if (selectError) {
      console.error("[cleanup-temp-images] SELECT failed", selectError);
      return new Response(
        JSON.stringify({
          error: "select_failed",
          message: selectError.message,
          deleted_so_far: totalDeleted,
          batches,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const targets = (rows ?? []) as ObjectRow[];
    if (targets.length === 0) {
      break;
    }

    const paths = targets.map((r) => r.name);
    const { data: removed, error: removeError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(paths);

    if (removeError) {
      console.error("[cleanup-temp-images] Storage remove failed", {
        error: removeError.message,
        attempted: paths.length,
        deleted_so_far: totalDeleted,
      });
      return new Response(
        JSON.stringify({
          error: "storage_remove_failed",
          message: removeError.message,
          attempted: paths.length,
          deleted_so_far: totalDeleted,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    totalDeleted += removed?.length ?? 0;
    batches++;

    // 1 batch が満杯でなければこれ以上はないので終了
    if (targets.length < BATCH_SIZE) {
      break;
    }
  }

  if (batches >= SAFE_MAX_BATCHES) {
    truncated = true;
    console.warn("[cleanup-temp-images] Reached SAFE_MAX_BATCHES, remaining will be processed on next run", {
      batches,
      deleted: totalDeleted,
    });
  }

  console.log("[cleanup-temp-images] success", {
    deleted: totalDeleted,
    batches,
    truncated,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      deleted: totalDeleted,
      batches,
      truncated,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
