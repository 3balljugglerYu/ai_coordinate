import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

/**
 * 管理者権限チェックのテスト用APIエンドポイント
 * このエンドポイントは管理者権限チェックの動作確認用です
 * 本番環境では削除するか、アクセスを制限してください
 */
export async function GET(request: NextRequest) {
  try {
    // requireAdmin()はthrow NextResponse.json()を使用するため、try-catchが必要
    let admin;
    try {
      admin = await requireAdmin();
    } catch (error) {
      // NextResponseインスタンスの場合はそのまま返す
      if (error instanceof NextResponse) {
        return error;
      }
      throw error;
    }

    // 管理者として認証された場合、管理者情報を返す
    return NextResponse.json({
      success: true,
      message: "管理者権限チェック成功",
      admin: {
        id: admin.id,
        email: admin.email,
      },
    });
  } catch (error) {
    console.error("Admin auth test error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
