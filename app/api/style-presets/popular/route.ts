import { connection, NextResponse } from "next/server";
import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";
import { getStyleGenerateCounts } from "@/features/style/lib/style-popularity";

/**
 * 「👑人気」の並び(公開中のスタイルの ID を、直近の生成数の多い順に)を返す API。
 *
 * ## なぜ必要か
 *
 * Web の `/styles` はサーバー側で生成数(`getStyleGenerateCounts`、直近30日)を読み、
 * 「👑人気」タブを生成数の多い順に並べている。アプリ(Flutter)は同じ一覧を
 * Supabase から直接読むが、生成数の元(`style_usage_events`)は RLS で全拒否・
 * 集計 RPC は service_role 専用なので、アプリからは読めない。並びだけをここで返す。
 *
 * ## 返すもの
 *
 * `{ presetIds: string[] }`。生成数が1以上のスタイルだけを多い順に並べる
 * (同数は公開一覧の並びのまま。Web の `filterStyleBrowsePresets("popular")` と同じ)。
 * **生成数そのものは返さない**(Web の画面にも出していない値のため)。
 * 公開一覧(`/styles`)に載るものだけを含め、未公開・admin_only の ID は出さない。
 * 誰が見ても同じ値なので、ログインは不要。
 *
 * 取得に失敗したときは空の並びを返す(Web と同じく、人気タブが出ないだけ)。
 *
 * `connection()` でリクエストごとに動かす(ビルド時に事前生成されて並びが固まらないように)。
 * 生成数そのものは `getStyleGenerateCounts` 側で数時間キャッシュされる。
 */
export async function GET() {
  await connection();
  try {
    const [presets, counts] = await Promise.all([
      getPublishedStylePresets(),
      getStyleGenerateCounts(),
    ]);
    const presetIds = presets
      .filter((preset) => (counts[preset.id] ?? 0) > 0)
      // 安定ソート: 同数は公開一覧の並びを維持
      .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))
      .map((preset) => preset.id);
    return NextResponse.json({ presetIds });
  } catch (error) {
    console.error("[style-presets popular] unexpected error:", error);
    return NextResponse.json({ presetIds: [] });
  }
}
