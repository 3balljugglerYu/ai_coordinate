import { NextResponse } from "next/server";
import { getPublishedStylePreset } from "@/features/style-presets/lib/get-public-style-presets";

/**
 * 公開中のスタイル1件の要約(一覧と同じ StylePresetPublicSummary)を返す API。
 *
 * ホームの引用元カード(Persta ORIGINAL)の「このカタログで生成する」から、
 * その場で生成シートを開くときに使う。シートはスタイルの要約を要るが、
 * フィードの投稿が持つのは生成時のスナップショット(id・表題・サムネイル)だけなので、
 * 押した人だけがここから取る(カードごとに先読みしない)。
 *
 * 返すのは公開一覧(/styles)に載るものだけ。未公開・admin_only・存在しない ID は
 * 区別せず 404(そこに何かあることを伝えない)。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const preset = await getPublishedStylePreset(id);
    if (!preset) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ preset });
  } catch (error) {
    console.error("[style-presets summary] unexpected error:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
