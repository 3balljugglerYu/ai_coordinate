import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { sanitizeProfileText, validateProfileText } from "@/lib/utils";

const MAX_NICKNAME_LENGTH = 20;
const MAX_BIO_LENGTH = 200;

/**
 * プロフィール情報取得API（GET）
 * 認証不要で閲覧可能
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // profilesテーブルからプロフィール情報を取得
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, user_id, nickname, bio, avatar_url, created_at, updated_at")
      .eq("user_id", userId)
      .single();

    if (error || !profile) {
      return NextResponse.json(
        { error: "プロフィールが見つかりません" },
        { status: 404 }
      );
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error("Profile GET API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "プロフィールの取得に失敗しました",
      },
      { status: 500 }
    );
  }
}

/**
 * プロフィール情報更新API（PATCH）
 * 本人のみ更新可能
 */
export async function PATCH(
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

    // 本人のみ更新可能
    if (user.id !== userId) {
      return NextResponse.json(
        { error: "権限がありません" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { nickname, bio } = body;

    const supabase = await createClient();

    // プロフィール情報を更新
    const updateData: { nickname?: string | null; bio?: string | null } = {};

    /**
     * プロフィールフィールドの処理（サニタイズ・バリデーション）
     * @param value 処理する値
     * @param maxLength 最大文字数
     * @param fieldName フィールド名（エラーメッセージ用）
     * @param allowEmpty 空文字を許可するか（デフォルト: true）
     * @returns 成功時はデータ、失敗時はエラーレスポンス
     */
    const processProfileField = (
      value: unknown,
      maxLength: number,
      fieldName: string,
      allowEmpty: boolean = true
    ): { success: true; data: string | null } | { success: false; response: NextResponse } => {
      if (value === null) {
        // nullに設定してクリアすることを許可する
        return { success: true, data: null };
      }
      if (typeof value !== "string") {
        // null以外の文字列ではない型（数値など）の場合
        return {
          success: false,
          response: NextResponse.json(
            { error: `${fieldName}は文字列である必要があります` },
            { status: 400 }
          ),
        };
      }

      // サニタイズ
      const sanitized = sanitizeProfileText(value);

      // バリデーション
      const validation = validateProfileText(
        sanitized.value,
        maxLength,
        fieldName,
        allowEmpty
      );

      if (!validation.valid) {
        return {
          success: false,
          response: NextResponse.json(
            { error: validation.error },
            { status: 400 }
          ),
        };
      }

      // サニタイズ後の値（空文字の場合はnull）
      return { success: true, data: sanitized.value || null };
    };

    // ニックネームの処理（空文字は許可しない）
    if (nickname !== undefined) {
      const result = processProfileField(
        nickname,
        MAX_NICKNAME_LENGTH,
        "ニックネーム",
        false // 空文字を許可しない
      );
      if (!result.success) return result.response;
      updateData.nickname = result.data;
    }

    // 自己紹介の処理
    if (bio !== undefined) {
      const result = processProfileField(bio, MAX_BIO_LENGTH, "自己紹介");
      if (!result.success) return result.response;
      updateData.bio = result.data;
    }

    const { data: updatedProfile, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("user_id", userId)
      .select("id, user_id, nickname, bio, avatar_url, created_at, updated_at")
      .single();

    if (error) {
      console.error("Profile update error:", error);
      return NextResponse.json(
        { error: "プロフィールの更新に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedProfile);
  } catch (error) {
    console.error("Profile PATCH API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "プロフィールの更新に失敗しました",
      },
      { status: 500 }
    );
  }
}

