import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";

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

    // バリデーション
    if (nickname !== undefined) {
      if (typeof nickname !== "string") {
        return NextResponse.json(
          { error: "ニックネームは文字列である必要があります" },
          { status: 400 }
        );
      }
      if (nickname.length > MAX_NICKNAME_LENGTH) {
        return NextResponse.json(
          { error: `ニックネームは${MAX_NICKNAME_LENGTH}文字以内で入力してください` },
          { status: 400 }
        );
      }
    }

    if (bio !== undefined) {
      if (typeof bio !== "string") {
        return NextResponse.json(
          { error: "自己紹介は文字列である必要があります" },
          { status: 400 }
        );
      }
      if (bio.length > MAX_BIO_LENGTH) {
        return NextResponse.json(
          { error: `自己紹介は${MAX_BIO_LENGTH}文字以内で入力してください` },
          { status: 400 }
        );
      }
    }

    const supabase = await createClient();

    // プロフィール情報を更新
    const updateData: { nickname?: string; bio?: string } = {};
    if (nickname !== undefined) {
      updateData.nickname = nickname.trim() || null;
    }
    if (bio !== undefined) {
      updateData.bio = bio.trim() || null;
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

