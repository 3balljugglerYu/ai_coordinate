import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSourcePromptSummaries } from "@/features/posts/lib/source-prompt-reference";

/**
 * 一覧（フィード）用の「このプロンプトで作る」サマリをまとめて返す API（ADR-005）。
 *
 * ## なぜ一覧 payload ではなく別エンドポイントなのか
 *
 * ホームの初回描画は `use cache` されており、閲覧者をまたいで共有される。表示形式は
 * localStorage の値なのでサーバーは知り得ず、payload に混ぜるとグリッド利用者にも
 * 解決コストを払わせるか、表示形式でキャッシュを二重に持つことになる。
 * フィードのときだけクライアントから取りに来る形にすれば、どちらも避けられる。
 *
 * ## 返すもの
 *
 * 可否・原作 post_id・原作者 id・利用数・公開設定だけ。**プロンプト本文は含めない**
 * （PROMPT-SECRECY-001）。判定は詳細画面と同じ `resolveSourcePromptReference` を
 * 通すので、一覧と詳細で CTA の可否が食い違わない。
 *
 * ## 認可
 *
 * ここで返すのは閲覧者に依存しない「原作が内在的に使えるか」だけで、フォロー有無は
 * 含まない。実際に生成できるかは生成 API・Worker・完了 RPC が再検証する。
 * 未ログインでも呼べる（フィードは未ログインでも見られる）。
 */

const bodySchema = z.object({
  post_ids: z.array(z.string().uuid()).min(1).max(50),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid body", errorCode: "PROMPT_ACTIONS_INVALID_BODY" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // CTA の対象になり得る投稿だけを引く（free の root と派生投稿）。
    // ここで列を絞るのは、本文列をそもそもメモリに載せないため。
    const { data, error } = await supabase
      .from("generated_images")
      .select("id, user_id, generation_type, source_post_id, source_author_id")
      .in("id", Array.from(new Set(parsed.data.post_ids)));

    if (error) {
      console.error("[prompt-actions] query failed:", error);
      return NextResponse.json(
        { error: "failed", errorCode: "PROMPT_ACTIONS_FETCH_FAILED" },
        { status: 500 }
      );
    }

    const summaries = await resolveSourcePromptSummaries(
      (data ?? []) as Parameters<typeof resolveSourcePromptSummaries>[0],
      supabase
    );

    return NextResponse.json({ summaries });
  } catch (error) {
    console.error("[prompt-actions] unexpected error:", error);
    return NextResponse.json(
      { error: "failed", errorCode: "PROMPT_ACTIONS_FETCH_FAILED" },
      { status: 500 }
    );
  }
}
