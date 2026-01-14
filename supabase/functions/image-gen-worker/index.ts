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
const STORAGE_BUCKET = "generated-images";

// 型定義
type GenerationType = "coordinate" | "specified_coordinate" | "full_body" | "chibi";
type GeminiModel = "gemini-2.5-flash-image" | "gemini-3-pro-image-1k" | "gemini-3-pro-image-2k" | "gemini-3-pro-image-4k";
type GeminiApiModel = "gemini-2.5-flash-image" | "gemini-3-pro-image-preview";

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
        inline_data?: {
          mime_type: string;
          data: string;
        };
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/**
 * モデル名を正規化（データベース保存用）
 */
function normalizeModelName(model: string | null): GeminiModel {
  if (!model) {
    return "gemini-2.5-flash-image";
  }
  if (model === "gemini-2.5-flash-image-preview" || model === "gemini-2.5-flash-image") {
    return "gemini-2.5-flash-image";
  }
  if (model === "gemini-3-pro-image-preview" || model === "gemini-3-pro-image") {
    return "gemini-3-pro-image-2k";
  }
  if (model === "gemini-3-pro-image-1k" || model === "gemini-3-pro-image-2k" || model === "gemini-3-pro-image-4k") {
    return model as GeminiModel;
  }
  return "gemini-2.5-flash-image";
}

/**
 * データベース保存値をAPIエンドポイント名に変換
 */
function toApiModelName(model: GeminiModel): GeminiApiModel {
  if (model.startsWith("gemini-3-pro-image-")) {
    return "gemini-3-pro-image-preview";
  }
  return "gemini-2.5-flash-image";
}

/**
 * モデル名から画像サイズを抽出
 */
function extractImageSize(model: GeminiModel): "1K" | "2K" | "4K" | null {
  if (model === "gemini-3-pro-image-1k") return "1K";
  if (model === "gemini-3-pro-image-2k") return "2K";
  if (model === "gemini-3-pro-image-4k") return "4K";
  return null;
}

/**
 * 背景変更の指示文を生成
 */
function getBackgroundDirective(shouldChangeBackground: boolean): string {
  return shouldChangeBackground
    ? "Adapt the background to match the new outfit's mood, setting, and styling, ensuring character lighting remains coherent."
    : "Keep the original background exactly as in the source image, editing only the outfit without altering the environment or lighting context.";
}

/**
 * プロンプトを構築（簡易版）
 */
function buildPrompt(
  generationType: GenerationType,
  outfitDescription: string,
  shouldChangeBackground: boolean
): string {
  const trimmedDescription = outfitDescription.trim();
  const backgroundDirective = getBackgroundDirective(shouldChangeBackground);

  // coordinateタイプのみ実装（他のタイプは後で拡張）
  if (generationType === "coordinate") {
    if (backgroundDirective.includes("Keep the original background")) {
      return `Edit **only the outfit** of the person in the image.

**New Outfit:**

${trimmedDescription}

Keep everything else consistent: face, hair, pose, expression, the entire background, lighting, and art style.`;
    } else {
      return `Edit **only the outfit** of the person in the image, and **generate a new background that complements the new look**.

**New Outfit:**

${trimmedDescription}

Keep everything else consistent: face, hair, pose, expression, lighting, and art style. Make sure the updated background still feels cohesive with the character and shares the same illustration style as the original.`;
    }
  }

  // デフォルト（coordinateと同じ）
  return `Edit **only the outfit** of the person in the image.

**New Outfit:**

${trimmedDescription}

Keep everything else consistent: face, hair, pose, expression, the entire background, lighting, and art style.`;
}

/**
 * Gemini APIレスポンスから画像データを抽出
 */
function extractImagesFromGeminiResponse(response: GeminiResponse): Array<{ mimeType: string; data: string }> {
  const images: Array<{ mimeType: string; data: string }> = [];

  if (!response.candidates) {
    return images;
  }

  for (const candidate of response.candidates) {
    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        images.push({
          mimeType: part.inlineData.mimeType,
          data: part.inlineData.data,
        });
      } else if (part.inline_data) {
        images.push({
          mimeType: part.inline_data.mime_type,
          data: part.inline_data.data,
        });
      }
    }
  }

  return images;
}

/**
 * Data URLからBase64を抽出
 */
function extractBase64FromDataUrl(dataUrl: string): { base64: string; mimeType: string } | null {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!matches) {
    return null;
  }
  return {
    mimeType: matches[1],
    base64: matches[2],
  };
}

Deno.serve(async (req: Request) => {
  try {
    // 環境変数の取得
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_STUDIO_API_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing environment variables" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY is not configured" }),
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

        // ===== フェーズ4-1: Gemini API呼び出しの実装 =====
        try {
          // モデル名の正規化
          const dbModel = normalizeModelName(job.model);
          const apiModel = toApiModelName(dbModel);

          // リクエストボディを構築
          const parts: Array<{
            text?: string;
            inline_data?: {
              mime_type: string;
              data: string;
            };
          }> = [];

          // 元画像がある場合は追加
          if (job.input_image_url) {
            const imageData = extractBase64FromDataUrl(job.input_image_url);
            if (imageData) {
              parts.push({
                inline_data: {
                  mime_type: imageData.mimeType,
                  data: imageData.base64,
                },
              });
            }
          }

          // プロンプトを構築
          const fullPrompt = job.input_image_url
            ? buildPrompt(job.generation_type as GenerationType, job.prompt_text, job.background_change)
            : job.prompt_text;

          parts.push({
            text: fullPrompt,
          });

          // リクエストボディ
          const requestBody: {
            contents: Array<{
              parts: typeof parts;
            }>;
            generationConfig?: {
              candidateCount?: number;
              imageConfig?: {
                imageSize?: "1K" | "2K" | "4K";
              };
            };
          } = {
            contents: [
              {
                parts,
              },
            ],
          };

          // Gemini 3 Pro Image Previewの場合、imageConfigを追加
          if (apiModel === "gemini-3-pro-image-preview") {
            const imageSize = extractImageSize(dbModel);
            if (imageSize) {
              requestBody.generationConfig = {
                ...requestBody.generationConfig,
                imageConfig: {
                  imageSize: imageSize,
                },
              };
            }
          }

          // APIエンドポイントURLを構築
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent`;

          // Gemini APIを呼び出し
          const geminiResponse = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": geminiApiKey,
            },
            body: JSON.stringify(requestBody),
          });

          if (!geminiResponse.ok) {
            const errorData = await geminiResponse.json();
            throw new Error(errorData.error?.message || `Gemini API error: ${geminiResponse.status}`);
          }

          const geminiData: GeminiResponse = await geminiResponse.json();

          if (geminiData.error) {
            throw new Error(geminiData.error.message || "Gemini API error");
          }

          // 画像データを抽出
          const images = extractImagesFromGeminiResponse(geminiData);

          if (images.length === 0) {
            throw new Error("No images generated");
          }

          // 最初の画像を使用（複数生成の場合は1枚目を使用）
          const generatedImage = images[0];

          // ===== フェーズ4-2: Supabase Storageへの画像保存 =====
          // Base64をUint8Arrayに変換（Deno環境ではatobが使用可能）
          const base64Data = generatedImage.data;
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);

          // ファイル名を生成（ユーザーID + タイムスタンプ + ランダム文字列）
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 15);
          const extension = generatedImage.mimeType.split("/")[1] || "png";
          const fileName = `${job.user_id}/${timestamp}-${randomStr}.${extension}`;

          // Supabase Storageにアップロード
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(fileName, byteArray, {
              contentType: generatedImage.mimeType,
              upsert: false,
            });

          if (uploadError) {
            console.error("Storage upload error:", uploadError);
            throw new Error(`画像のアップロードに失敗しました: ${uploadError.message}`);
          }

          // 公開URLを取得
          const {
            data: { publicUrl },
          } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(uploadData.path);

          console.log("Image uploaded successfully:", jobId, "Path:", uploadData.path, "URL:", publicUrl);

          // ===== フェーズ4-3: generated_imagesテーブルへの保存 =====
          const { data: imageRecord, error: insertError } = await supabase
            .from("generated_images")
            .insert({
              user_id: job.user_id,
              image_url: publicUrl,
              storage_path: uploadData.path,
              prompt: job.prompt_text,
              background_change: job.background_change,
              is_posted: false,
              generation_type: job.generation_type,
              model: dbModel,
              source_image_stock_id: job.source_image_stock_id,
            })
            .select()
            .single();

          if (insertError) {
            console.error("Database insert error:", insertError);
            throw new Error(`画像メタデータの保存に失敗しました: ${insertError.message}`);
          }

          console.log("Image record saved successfully:", jobId, "Record ID:", imageRecord?.id);

          // ===== フェーズ4-4: 成功時の処理 =====
          // image_jobsテーブルを更新（成功時）
          const { error: successUpdateError } = await supabase
            .from("image_jobs")
            .update({
              status: "succeeded",
              result_image_url: publicUrl,
              completed_at: new Date().toISOString(),
            })
            .eq("id", jobId);

          if (successUpdateError) {
            console.error("Failed to update job status to succeeded:", successUpdateError);
            throw new Error(`ジョブステータスの更新に失敗しました: ${successUpdateError.message}`);
          }

          // メッセージを削除（成功時）
          await supabase.schema("pgmq_public").rpc("delete", {
            queue_name: QUEUE_NAME,
            msg_id: msgId,
          });

          console.log("Job completed successfully:", jobId);
          processedCount++;
        } catch (error) {
          // ===== フェーズ4-4: 失敗時の処理 =====
          console.error("Generation error:", error);
          const errorMessage = error instanceof Error ? error.message : "Unknown error";

          // 現在のジョブのattemptsを取得（更新前に取得する必要がある）
          const { data: currentJob, error: jobFetchError } = await supabase
            .from("image_jobs")
            .select("attempts")
            .eq("id", jobId)
            .single();

          if (jobFetchError) {
            console.error("Failed to fetch job attempts:", jobFetchError);
            // ジョブの取得に失敗した場合、メッセージは削除しない（可視性タイムアウト後に再処理される）
            continue;
          }

          const newAttempts = (currentJob?.attempts || 0) + 1;
          const shouldMarkAsFailed = newAttempts >= 3;

          // image_jobsテーブルを更新（失敗時）
          const { error: failUpdateError } = await supabase
            .from("image_jobs")
            .update({
              status: shouldMarkAsFailed ? "failed" : "queued",
              error_message: errorMessage,
              attempts: newAttempts,
              completed_at: shouldMarkAsFailed ? new Date().toISOString() : null,
            })
            .eq("id", jobId);

          if (failUpdateError) {
            console.error("Failed to update job status to failed:", failUpdateError);
            // 更新に失敗した場合、メッセージは削除しない（可視性タイムアウト後に再処理される）
            continue;
          }

          // メッセージの削除/アーカイブ（attempts >= 3の場合のみ）
          if (shouldMarkAsFailed) {
            await supabase.schema("pgmq_public").rpc("delete", {
              queue_name: QUEUE_NAME,
              msg_id: msgId,
            });
            console.log("Job marked as failed after 3 attempts:", jobId);
          } else {
            // attempts < 3の場合はメッセージを削除しない（可視性タイムアウト後に再処理される）
            console.log("Job failed, will retry (attempts:", newAttempts, "):", jobId);
          }
        }
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
