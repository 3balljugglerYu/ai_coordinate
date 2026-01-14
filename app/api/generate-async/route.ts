import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generationRequestSchema } from "@/features/generation/lib/schema";
import { env } from "@/lib/env";
import type { ImageJobCreateInput } from "@/features/generation/lib/job-types";

/**
 * 非同期画像生成ジョブ投入API
 * ジョブを`image_jobs`テーブルに作成し、Supabase Queueにメッセージを送信
 */
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      );
    }

    // リクエストボディの解析
    const body = await request.json();

    // バリデーション
    const validationResult = generationRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const {
      prompt,
      sourceImageBase64,
      sourceImageMimeType,
      backgroundChange,
      generationType,
      model,
    } = validationResult.data;

    // 管理者クライアントを取得（RLSをバイパスしてQueueに送信するため）
    const supabase = createAdminClient();

    // sourceImageBase64がある場合、input_image_urlを設定
    // 実際のURLはEdge Function側で取得する（今回は簡略化のため、nullを設定）
    const inputImageUrl: string | null = null;

    // image_jobsテーブルにレコード作成
    const jobData: ImageJobCreateInput = {
      user_id: user.id,
      prompt_text: prompt,
      input_image_url: inputImageUrl,
      source_image_stock_id: null, // TODO: sourceImageStockIdを処理（スキーマに含まれていない場合は後で追加）
      generation_type: generationType || "coordinate",
      model: model || null,
      background_change: backgroundChange || false,
      status: "queued",
      attempts: 0,
    };

    const { data: job, error: insertError } = await supabase
      .from("image_jobs")
      .insert([jobData])
      .select()
      .single();

    if (insertError) {
      console.error("Failed to create image job:", insertError);
      return NextResponse.json(
        { error: "ジョブの作成に失敗しました" },
        { status: 500 }
      );
    }

    // Supabase Queueにメッセージ送信
    const { error: queueError } = await supabase.schema("pgmq_public").rpc(
      "send",
      {
        queue_name: "image_jobs",
        message: {
          job_id: job.id,
        },
        sleep_seconds: 0,
      }
    );

    if (queueError) {
      console.error("Failed to send message to queue:", queueError);
      // キューへの送信に失敗しても、ジョブは作成されているので、処理は続行
      // エラーログを記録し、Cronで処理されることを期待
    }

    // 即時処理の起動: Edge FunctionをHTTP経由で呼び出し（非同期、エラーは無視）
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceRoleKey) {
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/image-gen-worker`;
      fetch(edgeFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({}),
      }).catch((error) => {
        // エラーは無視（非同期処理のため）
        console.error("Failed to invoke Edge Function (ignored):", error);
      });
    }

    // レスポンス: ジョブIDとステータスを返却
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
    });
  } catch (error) {
    console.error("Generate async error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
