import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";

const STORAGE_BUCKET = "generated-images";
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * ストック画像アップロードAPI（POST）
 * サーバー経由でSupabase Storageにアップロードし、DBに保存
 * クライアント直接アップロード時の「Unexpected token '<'」エラーを回避
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "ファイルが選択されていません" },
        { status: 400 }
      );
    }

    // ファイルタイプの検証
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `許可されていないファイル形式です。対応形式: ${ALLOWED_MIME_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // ファイルサイズの検証
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "ファイルサイズは10MB以下にしてください" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 制限数チェック
    const { data: limitData, error: limitError } = await supabase.rpc(
      "get_stock_image_limit"
    );
    if (limitError) {
      console.error("RPC error:", limitError);
      return NextResponse.json(
        { error: "ストック画像制限数の取得に失敗しました" },
        { status: 500 }
      );
    }
    const limit = limitData ?? 3;

    const { count, error: countError } = await supabase
      .from("source_image_stocks")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (countError) {
      console.error("Database query error:", countError);
      return NextResponse.json(
        { error: "ストック画像数の取得に失敗しました" },
        { status: 500 }
      );
    }
    const currentCount = count ?? 0;

    if (currentCount >= limit) {
      return NextResponse.json(
        {
          error: `ストック画像の上限（${limit}枚）に達しています。不要なストックを削除するか、プランをアップグレードしてください。`,
        },
        { status: 400 }
      );
    }

    // ファイル名を生成
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const extension = file.name.split(".").pop() || "png";
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
      return NextResponse.json(
        {
          error:
            uploadError.message || "画像のアップロードに失敗しました",
        },
        { status: 500 }
      );
    }

    const { data: { publicUrl } } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(uploadData.path);

    // データベースに保存
    const { data: stock, error: insertError } = await supabase
      .from("source_image_stocks")
      .insert({
        user_id: user.id,
        image_url: publicUrl,
        storage_path: uploadData.path,
        name: file.name,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      // アップロード済みファイルは残るが、DBに保存できなかった
      return NextResponse.json(
        { error: `ストック画像の保存に失敗しました: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(stock);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("Stock image upload API error:", error);
    return NextResponse.json(
      { error: "ストック画像のアップロードに失敗しました" },
      { status: 500 }
    );
  }
}
