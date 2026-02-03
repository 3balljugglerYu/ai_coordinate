import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";

/**
 * 管理者権限チェックのテスト用APIエンドポイント
 * このエンドポイントは管理者権限チェックの動作確認用です
 * 本番環境では削除するか、アクセスを制限してください
 */
export async function GET(request: NextRequest) {
  try {
    // 現在のユーザーを取得
    const user = await getUser();
    
    // 環境変数の読み込み状況を確認
    const adminUserIds = getAdminUserIds();
    const rawEnvVar = process.env.ADMIN_USER_IDS;

    // 診断情報を返す（管理者でなくても診断情報は返す）
    const diagnosticInfo = {
      user: user
        ? {
            id: user.id,
            email: user.email,
          }
        : null,
      adminUserIds: adminUserIds,
      rawEnvVar: rawEnvVar || "(未設定)",
      envVarLength: rawEnvVar?.length || 0,
      isAdmin: user ? adminUserIds.includes(user.id) : false,
    };

    // 管理者権限チェック
    let admin;
    try {
      admin = await requireAdmin();
    } catch (error) {
      // NextResponseインスタンスの場合はそのまま返す
      if (error instanceof NextResponse) {
        // 診断情報を含めて返す
        const responseData = await error.json();
        return NextResponse.json(
          {
            ...responseData,
            diagnostic: diagnosticInfo,
          },
          { status: error.status }
        );
      }
      throw error;
    }

    // 管理者として認証された場合、管理者情報と診断情報を返す
    return NextResponse.json({
      success: true,
      message: "管理者権限チェック成功",
      admin: {
        id: admin.id,
        email: admin.email,
      },
      diagnostic: diagnosticInfo,
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
