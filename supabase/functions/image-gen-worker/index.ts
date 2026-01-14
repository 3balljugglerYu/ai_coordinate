// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * 画像生成ワーカー Edge Function
 * Supabase Queueからメッセージを読み取り、画像生成ジョブを処理
 */

const QUEUE_NAME = "image_jobs";
const VISIBILITY_TIMEOUT = 60; // 秒
const MAX_MESSAGES = 20; // 1回の読み取りで取得する最大メッセージ数

Deno.serve(async (req: Request) => {
  try {
    // 環境変数の取得
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing environment variables" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Supabaseクライアント初期化（サービスロールキー使用）
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // キューからのメッセージ取得
    const { data: messages, error: readError } = await supabase
      .schema("pgmq_public")
      .rpc("read", {
        queue_name: QUEUE_NAME,
        vt: VISIBILITY_TIMEOUT,
        qty: MAX_MESSAGES,
      });

    if (readError) {
      console.error("Failed to read from queue:", readError);
      return new Response(
        JSON.stringify({ error: "Failed to read from queue" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!messages || messages.length === 0) {
      // メッセージがない場合は正常終了
      return new Response(
        JSON.stringify({ processed: 0, message: "No messages in queue" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let processedCount = 0;
    let skippedCount = 0;

    // 各メッセージを処理
    for (const message of messages) {
      const msgId = message.msg_id;
      const jobId = message.message?.job_id;

      if (!jobId) {
        console.error("Message missing job_id:", message);
        // メッセージを削除してスキップ
        await supabase.schema("pgmq_public").rpc("delete", {
          queue_name: QUEUE_NAME,
          msg_id: msgId,
        });
        continue;
      }

      try {
        // ジョブのステータスを取得（冪等性チェック）
        const { data: job, error: jobError } = await supabase
          .from("image_jobs")
          .select("*")
          .eq("id", jobId)
          .single();

        if (jobError || !job) {
          console.error("Job not found:", jobId, jobError);
          // ジョブが見つからない場合はメッセージを削除
          await supabase.schema("pgmq_public").rpc("delete", {
            queue_name: QUEUE_NAME,
            msg_id: msgId,
          });
          continue;
        }

        // 冪等性チェック: 既に処理中または完了している場合はスキップ
        if (job.status === "processing" || job.status === "succeeded") {
          console.log("Job already processed, skipping:", jobId, job.status);
          // メッセージを削除
          await supabase.schema("pgmq_public").rpc("delete", {
            queue_name: QUEUE_NAME,
            msg_id: msgId,
          });
          skippedCount++;
          continue;
        }

        // ステータスを'processing'に更新（排他制御）
        const { error: updateError } = await supabase
          .from("image_jobs")
          .update({
            status: "processing",
            started_at: new Date().toISOString(),
          })
          .eq("id", jobId)
          .in("status", ["queued", "failed"]); // 既にprocessingの場合は更新しない

        if (updateError) {
          console.error("Failed to update job status:", updateError);
          // 更新に失敗した場合は、次のメッセージを処理（可視性タイムアウト後に再処理される）
          continue;
        }

        // TODO: フェーズ4で実際の画像生成処理を実装
        // ここではダミーレスポンスとして処理済みカウントをインクリメント
        processedCount++;

        // ダミー処理のため、メッセージは削除しない（フェーズ4で実装）
        // await supabase.schema("pgmq_public").rpc("delete", {
        //   queue_name: QUEUE_NAME,
        //   msg_id: msgId,
        // });
      } catch (error) {
        console.error("Error processing message:", error);
        // エラーが発生した場合、メッセージは削除しない（可視性タイムアウト後に再処理される）
      }
    }

    return new Response(
      JSON.stringify({
        processed: processedCount,
        skipped: skippedCount,
        total: messages.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Edge Function error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
