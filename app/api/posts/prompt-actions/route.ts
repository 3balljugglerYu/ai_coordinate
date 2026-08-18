import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSourcePromptSummaries } from "@/features/posts/lib/source-prompt-reference";
import { getOneTapStylePresetMetadata } from "@/shared/generation/one-tap-style-metadata";
import {
  isCollectionDisplayPeriodActive,
  isCollectionDisplayPeriodEnded,
} from "@/features/collections/lib/collection-display-period";
import { getStyleGenerateTotalCounts } from "@/features/style/lib/style-popularity";
import type { StylePresetLink } from "@/features/posts/types";

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

type OriginRow = {
  id: string;
  user_id: string | null;
  generation_type: string | null;
  source_post_id: string | null;
  source_author_id: string | null;
  generation_metadata: unknown;
};

/**
 * One-Tap Style 投稿の引用カードから公開ページへ飛べるようにする。
 *
 * 表題とサムネイルは投稿の `generation_metadata` に入っているので追加取得は不要。
 * 足りないのはリンク先だけで、公開ページ `/styles/[slug]` は slug 基準なのに
 * スナップショットは id しか持たないため、ここで id → slug を1クエリで解決する。
 *
 * 公開されていない・カテゴリが admin_only のプリセットは slug を返さない。
 * リンクを出しても 404 になるうえ、未公開の存在を知らせてしまう。
 */
async function resolveStylePresetLinks(
  supabase: ReturnType<typeof createAdminClient>,
  rows: OriginRow[]
): Promise<Record<string, StylePresetLink>> {
  const presetIdByPostId = new Map<string, string>();
  for (const row of rows) {
    const preset = getOneTapStylePresetMetadata({
      generation_type: row.generation_type,
      generation_metadata: row.generation_metadata,
    });
    if (preset?.id) {
      presetIdByPostId.set(row.id, preset.id);
    }
  }
  if (presetIdByPostId.size === 0) {
    return {};
  }

  const [{ data, error }, generateTotals] = await Promise.all([
    supabase
    .from("style_presets")
    .select(
      "id, slug, category:preset_categories!style_presets_category_id_fkey(visibility, collection_display_starts_at, collection_display_ends_at)"
    )
    .in("id", Array.from(new Set(presetIdByPostId.values())))
    .eq("status", "published"),
    // 探索シートが出している累計回数と同じ値を使う(use cache 済み・正本を増やさない)
    getStyleGenerateTotalCounts().catch(() => ({}) as Record<string, number>),
  ]);

  if (error) {
    // リンクが出ないだけで引用カード自体は描けるので、失敗は握りつぶす
    console.error("[prompt-actions] style preset lookup failed:", error);
    return {};
  }

  const slugByPresetId = new Map<string, string>();
  // 「公開されていたが会期が終わった」プリセット。リンクは出せないが理由は伝える。
  const endedPresetIds = new Set<string>();
  for (const row of data ?? []) {
    // PostgREST の型推論は埋め込みリレーションを配列として扱うため unknown 経由で受ける
    const typed = row as unknown as {
      id: string;
      slug: string | null;
      category:
        | {
            visibility: string | null;
            collection_display_starts_at: string | null;
            collection_display_ends_at: string | null;
          }
        | null;
    };
    // 判定は /styles/[slug] の canAccessCategory と揃える。緩いとリンク先が
    // 404 になり、厳しいと使えるはずの導線が消える。
    const isPublic =
      typed.category?.visibility === "public" &&
      isCollectionDisplayPeriodActive({
        collectionDisplayStartsAt: typed.category.collection_display_starts_at,
        collectionDisplayEndsAt: typed.category.collection_display_ends_at,
      });
    if (!typed.slug || !isPublic) {
      /*
        会期が終わっただけの企画は「無いもの」ではない。投稿カードにプリセット名も
        サムネイルも出ているので秘匿対象ではなく、黙ってリンクを消すと
        「押しても反応しないカード」になる。visibility=public のものに限り
        終了として伝える（admin_only・未公開・開始前はこれまで通り黙る）。
      */
      if (
        typed.category?.visibility === "public" &&
        isCollectionDisplayPeriodEnded({
          collectionDisplayStartsAt: typed.category.collection_display_starts_at,
          collectionDisplayEndsAt: typed.category.collection_display_ends_at,
        })
      ) {
        endedPresetIds.add(typed.id);
      }
      continue;
    }
    slugByPresetId.set(typed.id, typed.slug);
  }

  const links: Record<string, StylePresetLink> = {};
  for (const [postId, presetId] of presetIdByPostId) {
    const slug = slugByPresetId.get(presetId) ?? null;
    links[postId] = {
      presetId,
      slug,
      /*
        公開できないプリセット(未公開・admin_only・表示期間外)は利用回数も返さない。
        リンクを出さないと決めたのに人気度だけ公開フィードに出るのは筋が通らず、
        限定公開・先行公開の運用でも漏れる。
      */
      usageCount: slug ? (generateTotals[presetId] ?? 0) : 0,
      isEnded: endedPresetIds.has(presetId),
    };
  }
  return links;
}

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

    // 公開中の投稿だけを通す（fail closed）。
    //
    // この route は未ログインでも呼べる公開 API で、admin クライアントが RLS を
    // 迂回して読む。ここを絞らないと、既知の UUID を投げるだけで未投稿・公開停止の
    // 行まで resolver に渡り、原作 ID・原作者・利用数といった系譜のメタデータを
    // 引き出せてしまう（本文ではないが、取り消した投稿の情報は返してはいけない）。
    //
    // 列を絞っているのは、本文列をそもそもメモリに載せないため。
    const { data, error } = await supabase
      .from("generated_images")
      .select(
        "id, user_id, generation_type, source_post_id, source_author_id, generation_metadata"
      )
      .in("id", Array.from(new Set(parsed.data.post_ids)))
      .eq("is_posted", true)
      .eq("moderation_status", "visible");

    if (error) {
      console.error("[prompt-actions] query failed:", error);
      return NextResponse.json(
        { error: "failed", errorCode: "PROMPT_ACTIONS_FETCH_FAILED" },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as OriginRow[];

    const [summaries, styleLinks] = await Promise.all([
      resolveSourcePromptSummaries(
        rows as Parameters<typeof resolveSourcePromptSummaries>[0],
        supabase
      ),
      resolveStylePresetLinks(supabase, rows),
    ]);

    return NextResponse.json({ summaries, styleLinks });
  } catch (error) {
    console.error("[prompt-actions] unexpected error:", error);
    return NextResponse.json(
      { error: "failed", errorCode: "PROMPT_ACTIONS_FETCH_FAILED" },
      { status: 500 }
    );
  }
}
