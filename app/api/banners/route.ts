/**
 * 公開バナー一覧API（ホーム表示用）
 * 認証不要、キャッシュあり
 */

import { NextResponse } from "next/server";
import { getPublicBanners } from "@/features/banners/lib/get-banners";

export async function GET() {
  try {
    const banners = await getPublicBanners();
    return NextResponse.json(banners);
  } catch (error) {
    console.error("[API /banners] Error:", error);
    return NextResponse.json(
      { error: "バナーの取得に失敗しました" },
      { status: 500 }
    );
  }
}
