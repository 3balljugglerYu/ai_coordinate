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

    // ニックネームのバリデーションとサニタイズ
    if (nickname !== undefined) {
      if (nickname === null) {
        // nicknameをnullに設定してクリアすることを許可する
        updateData.nickname = null;
      } else if (typeof nickname !== "string") {
        // null以外の文字列ではない型（数値など）の場合
        return NextResponse.json(
          { error: "ニックネームは文字列である必要があります" },
          { status: 400 }
        );
      } else {
        // サニタイズ
        const sanitized = sanitizeProfileText(nickname);
        
        // バリデーション（空文字は許可するため、空文字チェックは不要）
        const validation = validateProfileText(
          sanitized.value,
          MAX_NICKNAME_LENGTH,
          "ニックネーム"
        );
        
        if (!validation.valid) {
          return NextResponse.json(
            { error: validation.error },
            { status: 400 }
          );
        }
        
        // サニタイズ後の値（空文字の場合はnull）
        updateData.nickname = sanitized.value || null;
      }
    }

    // 自己紹介のバリデーションとサニタイズ
    if (bio !== undefined) {
      if (bio === null) {
        // bioをnullに設定してクリアすることを許可する
        updateData.bio = null;
      } else if (typeof bio !== "string") {
        return NextResponse.json(
          { error: "自己紹介は文字列である必要があります" },
          { status: 400 }
        );
      } else {
        // サニタイズ
        const sanitized = sanitizeProfileText(bio);
        
        // バリデーション
        const validation = validateProfileText(
          sanitized.value,
          MAX_BIO_LENGTH,
          "自己紹介"
        );
        
        if (!validation.valid) {
          return NextResponse.json(
            { error: validation.error },
            { status: 400 }
          );
        }
        
        // サニタイズ後の値（空文字の場合はnull）
        updateData.bio = sanitized.value || null;
      }
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

