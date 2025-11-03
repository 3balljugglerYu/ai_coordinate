import { NextRequest, NextResponse } from "next/server";

/**
 * Nano Banana Webhook受け口
 * 画像生成完了時の通知を受け取る（必要に応じて実装）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // TODO: Webhookの検証と処理を実装
    // 現時点ではプレースホルダー

    console.log("Webhook received:", body);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

