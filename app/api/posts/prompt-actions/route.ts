import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getPromptActions,
  normalizePromptActionPostIds,
} from "@/features/posts/lib/prompt-action-cache";

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
 *
 * 閲覧者に依存しないからこそ、解決結果は `prompt-action-cache` で全員ぶんを
 * 共有できる。この route は入力を正規化して渡すだけに留める。
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

    /*
      重複除去と整列は**キャッシュに当てるために**必要。同じ集合でも順序が
      違うだけで別エントリになる。ここで正規化してから渡す。
    */
    const postIds = normalizePromptActionPostIds(parsed.data.post_ids);

    return NextResponse.json(await getPromptActions(postIds));
  } catch (error) {
    console.error("[prompt-actions] unexpected error:", error);
    return NextResponse.json(
      { error: "failed", errorCode: "PROMPT_ACTIONS_FETCH_FAILED" },
      { status: 500 }
    );
  }
}
