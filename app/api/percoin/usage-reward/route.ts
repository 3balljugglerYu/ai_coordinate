import { NextResponse } from "next/server";
import { getPercoinDefaultsForDisplay } from "@/features/credits/lib/get-percoin-defaults";

/**
 * クリエイター還元の付与額を返す（告知の出し分け用）。
 *
 * 0 は「停止中」を意味し、呼び出し側は告知そのものを出さない。
 * 運営が admin でいつでも変えるため、文言に額を埋め込まずここから取る。
 *
 * 認証は不要（告知として誰にでも見せる情報）。サブスク倍率は掛けない
 * （還元は利用者側の行動で発生し、受け手のプラン特典ではない）。
 *
 * 取得元の getPercoinDefaultsForDisplay は React.cache 済みで、呼び出し側も
 * モジュールスコープでキャッシュするため、ここでは route の revalidate を
 * 指定しない（このプロジェクトの nextConfig.cacheComponents と非互換）。
 */
export async function GET() {
  try {
    const defaults = await getPercoinDefaultsForDisplay("free");

    return NextResponse.json({
      promptUsageRewardAmount: defaults.promptUsageRewardAmount,
      styleUsageRewardAmount: defaults.styleUsageRewardAmount,
    });
  } catch (error) {
    console.error("[Percoin Usage Reward] GET error:", error);
    // 取得できないときは「停止中」として扱う。誤って告知を出すより出さない方が安全。
    return NextResponse.json({
      promptUsageRewardAmount: 0,
      styleUsageRewardAmount: 0,
    });
  }
}
