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
      sourceImageStockId,
      backgroundChange,
      generationType,
      model,
    } = validationResult.data;

    // 管理者クライアントを取得（RLSをバイパスしてQueueに送信するため）
    const supabase = createAdminClient();

    // sourceImageBase64またはsourceImageStockIdがある場合、input_image_urlを設定
    let inputImageUrl: string | null = null;
    let stockId: string | null = null;

    if (sourceImageStockId) {
      // ストック画像IDがある場合、ストック画像のURLを取得
      try {
        const { data: stock, error: stockError } = await supabase
          .from("source_image_stocks")
          .select("id, image_url")
          .eq("id", sourceImageStockId)
          .eq("user_id", user.id) // ユーザーのストック画像のみ取得
          .single();

        if (stockError || !stock) {
          console.error("Failed to fetch source image stock:", stockError);
          return NextResponse.json(
            { error: "ストック画像が見つかりません" },
            { status: 404 }
          );
        }

        inputImageUrl = stock.image_url;
        stockId = stock.id;
      } catch (error) {
        console.error("Error fetching source image stock:", error);
        return NextResponse.json(
          { error: "ストック画像の取得に失敗しました" },
          { status: 500 }
        );
      }
    } else if (sourceImageBase64 && sourceImageMimeType) {
      // sourceImageBase64がある場合、一時的にStorageにアップロードしてURLを取得
      try {
        // Base64をBufferに変換
        const base64Data = sourceImageBase64.replace(/^data:.+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        // 一時ファイル名を生成
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 15);
        const extension = sourceImageMimeType.split("/")[1] || "png";
        const fileName = `temp/${user.id}/${timestamp}-${randomStr}.${extension}`;

        // Storageにアップロード（generated-imagesバケットのtemp/フォルダに保存）
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("generated-images")
          .upload(fileName, buffer, {
            contentType: sourceImageMimeType,
            upsert: false,
          });

        if (uploadError) {
          console.error("Failed to upload source image:", uploadError);
          // アップロードに失敗しても処理は続行（Edge Functionでエラーになる）
        } else {
          // 公開URLを取得
          const {
            data: { publicUrl },
          } = supabase.storage.from("generated-images").getPublicUrl(uploadData.path);
          inputImageUrl = publicUrl;
        }
      } catch (error) {
        console.error("Error uploading source image:", error);
        // エラーが発生しても処理は続行（Edge Functionでエラーになる）
      }
    }

    // image_jobsテーブルにレコード作成
    const jobData: ImageJobCreateInput = {
      user_id: user.id,
      prompt_text: prompt,
      input_image_url: inputImageUrl,
      source_image_stock_id: stockId,
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
    // 注意: PostgRESTはpublicとgraphql_publicスキーマのみを許可するため、
    // pgmq_public.send()の代わりにpublic.pgmq_send()ラッパー関数を使用
    const { error: queueError } = await supabase.rpc("pgmq_send", {
      p_queue_name: "image_jobs",
      p_message: {
        job_id: job.id,
      },
      p_delay: 0,
    });

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
