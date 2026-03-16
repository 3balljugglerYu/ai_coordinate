import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getSourceImageRouteCopy } from "@/features/generation/lib/source-image-route-copy";

const STORAGE_BUCKET = "generated-images";
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * ストック画像アップロードAPI（POST）
 * サーバー経由でSupabase Storageにアップロードし、DBに保存
 * クライアント直接アップロード時の「Unexpected token '<'」エラーを回避
 */
export async function POST(request: NextRequest) {
  const copy = getSourceImageRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "SOURCE_IMAGE_AUTH_REQUIRED", 401);
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return jsonError(copy.fileRequired, "SOURCE_IMAGE_FILE_REQUIRED", 400);
    }

    // ファイルタイプの検証
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return jsonError(
        copy.unsupportedFormat(ALLOWED_MIME_TYPES.join(", ")),
        "SOURCE_IMAGE_UNSUPPORTED_FORMAT",
        400
      );
    }

    // ファイルサイズの検証
    if (file.size > MAX_FILE_SIZE) {
      return jsonError(copy.fileTooLarge, "SOURCE_IMAGE_FILE_TOO_LARGE", 400);
    }

    const supabase = await createClient();

    // ファイル名を生成（MIMEタイプから拡張子を決定。file.nameは改ざんの可能性があるため使用しない）
    const mimeToExt: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const extension = mimeToExt[file.type] ?? "png";
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const fileName = `${user.id}/stocks/${timestamp}-${randomStr}.${extension}`;

    // Supabase Storageにアップロード（サーバー経由でHTML/JSONエラーを回避）
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return jsonError(copy.uploadFailed, "SOURCE_IMAGE_UPLOAD_FAILED", 500);
    }

    const { data: { publicUrl } } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(uploadData.path);

    // アトミックに制限数チェック＋DB保存（レースコンディション防止）
    const { data: stock, error: rpcError } = await supabase.rpc(
      "insert_source_image_stock",
      {
        p_user_id: user.id,
        p_image_url: publicUrl,
        p_storage_path: uploadData.path,
        p_name: file.name,
      }
    );

    if (rpcError) {
      console.error("insert_source_image_stock RPC error:", rpcError);
      const isLimitError =
        rpcError.message?.includes("上限") ?? false;
      return jsonError(
        isLimitError ? copy.stockLimitReached : copy.saveFailed,
        isLimitError ? "SOURCE_IMAGE_LIMIT_REACHED" : "SOURCE_IMAGE_SAVE_FAILED",
        isLimitError ? 400 : 500
      );
    }

    // RPCが単一行を返す場合、PostgRESTは配列で返すことがある
    const stockRecord = Array.isArray(stock) ? stock[0] : stock;
    return NextResponse.json(stockRecord);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("Stock image upload API error:", error);
    return jsonError(copy.uploadFailed, "SOURCE_IMAGE_UPLOAD_FAILED", 500);
  }
}
