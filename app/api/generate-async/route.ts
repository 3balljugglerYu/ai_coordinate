import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generationRequestSchema, getSafeExtensionFromMimeType } from "@/features/generation/lib/schema";
import { convertHeicBase64ToJpeg, isHeicImage } from "@/features/generation/lib/heic-converter";
import { env } from "@/lib/env";
import type { ImageJobCreateInput } from "@/features/generation/lib/job-types";
import { getPercoinCost } from "@/features/generation/lib/model-config";

const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;

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
        // Base64データを取得（data:プレフィックスを除去）
        let base64Data = sourceImageBase64.replace(/^data:.+;base64,/, "");
        let mimeType = sourceImageMimeType;
        let extension: string;

        // 過大な入力画像を早期に拒否（base64長からデコード後バイト数を推定）
        const estimatedBytes = Math.floor((base64Data.length * 3) / 4);
        if (estimatedBytes > MAX_SOURCE_IMAGE_BYTES) {
          return NextResponse.json(
            { error: "画像サイズが大きすぎます。10MB以下の画像に圧縮して再試行してください。" },
            { status: 400 }
          );
        }

        // HEIC/HEIF形式の場合はJPEGに変換
        if (isHeicImage(sourceImageMimeType)) {
          try {
            const converted = await convertHeicBase64ToJpeg(base64Data, 0.9);
            base64Data = converted.base64;
            mimeType = converted.mimeType;
            extension = "jpg";
          } catch (conversionError) {
            console.error("Failed to convert HEIC image:", conversionError);
            return NextResponse.json(
              { error: "HEIC画像の変換に失敗しました" },
              { status: 400 }
            );
          }
        } else {
          // HEIC/HEIF以外の場合は、安全に拡張子を取得
          extension = getSafeExtensionFromMimeType(sourceImageMimeType);
        }

        // Base64をBufferに変換
        const buffer = Buffer.from(base64Data, "base64");

        // 一時ファイル名を生成
        // パストラバーサル攻撃を防ぐため、MIMEタイプから安全に拡張子を取得
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 15);
        // ファイル名のパス要素も安全にする（user.idはUUIDで検証済み、timestampとrandomStrは数値/英数字のみ）
        const fileName = `temp/${user.id}/${timestamp}-${randomStr}.${extension}`;

        // Storageにアップロード（generated-imagesバケットのtemp/フォルダに保存）
        // 注意: HEIC変換後の場合は、変換後のMIMEタイプ（JPEG）を使用
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("generated-images")
          .upload(fileName, buffer, {
            contentType: mimeType,
            upsert: false,
          });

        if (uploadError) {
          console.error("Failed to upload source image:", uploadError);
          // アップロード失敗時は即座にエラーを返す（ユーザーへのフィードバックを早める）
          return NextResponse.json(
            { error: "元画像のアップロードに失敗しました。もう一度お試しください。" },
            { status: 500 }
          );
        }

        // 公開URLを取得
        const {
          data: { publicUrl },
        } = supabase.storage.from("generated-images").getPublicUrl(uploadData.path);
        inputImageUrl = publicUrl;
      } catch (error) {
        console.error("Error uploading source image:", error);
        // エラーが発生した場合は即座にエラーを返す
        return NextResponse.json(
          { error: "元画像の処理中にエラーが発生しました。もう一度お試しください。" },
          { status: 500 }
        );
      }
    }

    // 1枚分のペルコイン残高チェック
    const percoinCost = getPercoinCost(model || 'gemini-2.5-flash-image');
    
    // 現在の残高を取得
    // user_idはUNIQUE制約があるため、single()を使用してデータ整合性の問題を早期検出
    const { data: creditData, error: creditError } = await supabase
      .from("user_credits")
      .select("balance")
      .eq("user_id", user.id)
      .single();

    if (creditError) {
      console.error("Failed to fetch user credits:", creditError);
      // レコードが存在しない場合は、データ不整合の可能性があるためエラーを返す
      // （新規ユーザーの場合はEdge Functionでレコードを作成する）
      return NextResponse.json(
        { error: "ペルコイン残高の取得に失敗しました" },
        { status: 500 }
      );
    }

    const currentBalance = creditData.balance;

    // 残高チェック
    if (currentBalance < percoinCost) {
      return NextResponse.json(
        {
          error: `ペルコイン残高が不足しています。生成には${percoinCost}ペルコイン必要ですが、現在の残高は${currentBalance}ペルコインです。`,
        },
        { status: 400 }
      );
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

    // 即時処理の起動: Edge FunctionをHTTP経由で呼び出し（非同期、エラーは無視）
    // 注意: Edge Functionは--no-verify-jwtフラグでデプロイされているため、
    // Authorizationヘッダーは不要です。Service Role Keyの漏洩リスクを避けるため、
    // 可能な限り削除を推奨します。
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    let edgeFunctionInvoked = false;

    if (supabaseUrl) {
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/image-gen-worker`;
      try {
        fetch(edgeFunctionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }).catch((error) => {
          // Edge Functionの呼び出し自体が失敗した場合のログを強化
          // 非同期処理のため、ここではAPIのレスポンスには影響を与えませんが、
          // ログを詳細化することで、運用上の問題発見に役立ちます。
          console.error("Failed to invoke Edge Function:", {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            edgeFunctionUrl,
          });
        });
        edgeFunctionInvoked = true;
      } catch (error) {
        console.error("Failed to initiate Edge Function call:", error);
      }
    }

    // キュー送信失敗時の処理
    if (queueError) {
      console.error("Failed to send message to queue:", queueError);
      // キューへの送信に失敗しても、ジョブは作成されている
      // Edge Functionの即時呼び出しも失敗している可能性がある
      // Cronジョブ（10秒ごと）が処理を拾うまで遅延する可能性があることをユーザーに通知
      return NextResponse.json(
        {
          jobId: job.id,
          status: job.status,
          warning: queueError
            ? "ジョブは作成されましたが、処理の開始が遅延する可能性があります。数秒後に再確認してください。"
            : undefined,
        },
        { status: 202 } // Accepted: リクエストは受理されたが、処理は完了していない
      );
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
