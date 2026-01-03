import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * プロフィール画像アップロードAPI（POST）
 * 本人のみアップロード可能
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const user = await requireAuth();
    const { userId } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // 本人のみアップロード可能
    if (user.id !== userId) {
      return NextResponse.json(
        { error: "権限がありません" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "ファイルが選択されていません" },
        { status: 400 }
      );
    }

    // ファイルタイプの検証
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "画像ファイルのみアップロード可能です" },
        { status: 400 }
      );
    }

    // ファイルサイズの検証（10MB制限）
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "ファイルサイズは10MB以下にしてください" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Storageバケット名（既存のgenerated-imagesバケットを再利用）
    const AVATAR_BUCKET = "generated-images";

    // 既存のavatar_urlを取得（古い画像を削除するため）
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", userId)
      .single();

    // ファイル名を生成（フォルダ: avatars/{userId}/タイムスタンプ.拡張子）
    const fileExt = file.name.split(".").pop();
    const fileName = `avatars/${userId}/${Date.now()}.${fileExt}`;
    const filePath = fileName;

    // Supabase Storageにアップロード
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error("Avatar upload error:", uploadError);
      return NextResponse.json(
        {
          error:
            uploadError.message ||
            "画像のアップロードに失敗しました",
        },
        { status: 500 }
      );
    }

    // 公開URLを取得
    const {
      data: { publicUrl },
    } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);

    // profilesテーブルのavatar_urlを更新
    const { data: updatedProfile, error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("user_id", userId)
      .select("id, user_id, nickname, bio, avatar_url, created_at, updated_at")
      .single();

    if (updateError) {
      console.error("Profile update error:", updateError);
      // アップロードは成功したが、プロフィール更新に失敗した場合は、アップロードしたファイルを削除
      await supabase.storage.from(AVATAR_BUCKET).remove([filePath]);
      return NextResponse.json(
        { error: "プロフィールの更新に失敗しました" },
        { status: 500 }
      );
    }

    // 古い画像を削除（新しい画像のアップロードと更新が成功した場合のみ）
    if (currentProfile?.avatar_url) {
      try {
        const oldAvatarUrl = currentProfile.avatar_url;
        
        // Supabase StorageのURLかどうかを確認
        // 形式: https://{project-ref}.supabase.co/storage/v1/object/public/{bucket}/{path}
        // または: https://{project-ref}.supabase.co/storage/v1/object/sign/{bucket}/{path}?...
        const isSupabaseStorageUrl = oldAvatarUrl.includes("/storage/v1/object/") && 
                                     oldAvatarUrl.includes(`/${AVATAR_BUCKET}/`);
        
        if (!isSupabaseStorageUrl) {
          // Google OAuthなどの外部URLの場合は削除不要
          console.log("Old avatar URL is not from Supabase Storage, skipping deletion:", oldAvatarUrl);
        } else {
          // URLからパスを抽出
          let oldPath: string | null = null;
          
          try {
            // URLコンストラクタを使用して堅牢に解析
            const url = new URL(oldAvatarUrl);
            // pathnameを分割してバケット内のパスを取得
            const pathSegments = url.pathname.split(`/${AVATAR_BUCKET}/`);
            if (pathSegments.length === 2) {
              // パスはデコードする必要がある
              oldPath = decodeURIComponent(pathSegments[1]);
            }
          } catch (e) {
            console.warn("古いアバターURLを解析できませんでした。完全なURLではない可能性があります:", { url: oldAvatarUrl, error: e });
          }
          
          if (oldPath && oldPath.startsWith("avatars/")) {
            // 古い画像を削除（エラーが発生しても処理は続行）
            console.log("Deleting old avatar image:", oldPath);
            
            // Service Role Keyを使用して削除（RLSポリシーをバイパス）
            if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) {
              // Service Role Keyが存在しない場合は、古い画像の削除をスキップ
              // 新しい画像のアップロードは既に成功しているため、処理は続行
              // 古い画像はStorageに残るが、新しい画像は正常にアップロードされている
              console.warn("Service role key or Supabase URL is missing. Old avatar image will not be deleted from storage.");
            } else {
              try {
                const storageClient = createSupabaseClient(
                  env.NEXT_PUBLIC_SUPABASE_URL,
                  env.SUPABASE_SERVICE_ROLE_KEY
                );

                const { error: deleteError } = await storageClient.storage
                  .from(AVATAR_BUCKET)
                  .remove([oldPath]);

                if (deleteError) {
                  // 削除エラーはログに記録するが、レスポンスは成功を返す
                  console.error("Failed to delete old avatar image:", {
                    path: oldPath,
                    error: deleteError,
                    url: oldAvatarUrl,
                  });
                } else {
                  console.log("Successfully deleted old avatar image:", oldPath);
                }
              } catch (storageError) {
                // ストレージ削除エラーはログに記録するが、レスポンスは成功を返す
                console.error("Error while deleting old avatar image:", storageError);
              }
            }
          } else {
            console.warn("Could not extract valid path from old avatar URL:", {
              url: oldAvatarUrl,
              extractedPath: oldPath,
            });
          }
        }
      } catch (deleteError) {
        // 削除処理でエラーが発生しても、新しい画像のアップロードは成功しているので続行
        console.error("Error while deleting old avatar image:", deleteError);
      }
    }

    return NextResponse.json({
      avatar_url: publicUrl,
      profile: updatedProfile,
    });
  } catch (error) {
    console.error("Avatar upload API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "画像のアップロードに失敗しました",
      },
      { status: 500 }
    );
  }
}

