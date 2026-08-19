import "server-only";

import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSourcePromptSummaries } from "./source-prompt-reference";
import { getOneTapStylePresetMetadata } from "@/shared/generation/one-tap-style-metadata";
import {
  isCollectionDisplayPeriodActive,
  isCollectionDisplayPeriodEnded,
} from "@/features/collections/lib/collection-display-period";
import { getStyleGenerateTotalCounts } from "@/features/style/lib/style-popularity";
import type { PromptActionSummary, StylePresetLink } from "../types";

/**
 * フィードの「このプロンプトで作る」サマリを**閲覧者をまたいで**キャッシュする（ADR-005）。
 *
 * ## なぜキャッシュしてよいのか
 *
 * ここで解決するのは「原作が内在的に使えるか」だけで、**閲覧者に依存しない**。
 * フォロー有無は別 API（follow-status/batch）が閲覧者ごとに解決し、最終的な
 * 認可は生成 API・Worker・完了 RPC が再検証する。したがって同じ投稿集合に
 * 対する答えは全員同じで、共有して差し支えない。
 *
 * ## なぜ投稿単位ではなくバッチ単位なのか
 *
 * 投稿ごとにキャッシュすると、キャッシュミス時に投稿ごとの解決へ戻ってしまい、
 * 原作数に比例した DB 往復が復活する。バッチ単位なら、ミスしても解決は
 * まとめて1回で済む（＝キャッシュが無かった頃と同じコスト）。
 *
 * ホームの1ページ目は並び順が全員同じなので、投稿 ID の集合もそのまま一致する。
 * 一番人が通るところで当たる形になっている。
 *
 * ## 鮮度
 *
 * `cacheLife("minutes")` に加え、投稿取消・モデレーション判定で明示的に
 * 失効させる。この2つは `isAvailable` を true → false へ落とすので、古い値を
 * 返すと「押せたのに作れない」になる。逆向き（作れるようになった）は CTA が
 * 少し遅れて出るだけなので、自然失効に任せて無効化の頻度を上げない。
 */
export const PROMPT_ACTIONS_CACHE_TAG = "prompt-actions";

/**
 * 投稿の状態が変わったときに、フィードの CTA サマリを失効させる。
 *
 * `revalidateTag` は1つの失敗で呼び出し元の処理を巻き添えにしないよう
 * non-fatal で呼ぶ（モデレーション判定と同じ方針）。
 */
export function revalidatePromptActions(): void {
  try {
    revalidateTag(PROMPT_ACTIONS_CACHE_TAG, "max");
  } catch (error) {
    console.error("[prompt-actions] revalidateTag failed:", error);
  }
}

export interface PromptActionsPayload {
  summaries: Record<string, PromptActionSummary>;
  styleLinks: Record<string, StylePresetLink>;
}

type OriginRow = {
  id: string;
  user_id: string | null;
  generation_type: string | null;
  source_post_id: string | null;
  source_author_id: string | null;
  generation_metadata: unknown;
};

/**
 * キャッシュのキーになる投稿 ID 列を正規化する。
 *
 * **重複除去と整列は必須**。同じ集合でも順序が違うだけで別のキャッシュ
 * エントリになり、当たらなくなる（フィードの並びは全員同じでも、
 * スクロール位置によって送る順序が変わり得る）。
 */
export function normalizePromptActionPostIds(postIds: string[]): string[] {
  return Array.from(new Set(postIds)).sort();
}

/**
 * フィード用の CTA サマリとスタイルリンクを解決する（キャッシュ付き）。
 *
 * @param postIds `normalizePromptActionPostIds` を通した投稿 ID 列
 */
export async function getPromptActions(
  postIds: string[]
): Promise<PromptActionsPayload> {
  "use cache";
  cacheTag(PROMPT_ACTIONS_CACHE_TAG);
  cacheLife("minutes");

  return resolvePromptActions(postIds);
}

/** キャッシュを挟まない解決本体。 */
async function resolvePromptActions(
  postIds: string[]
): Promise<PromptActionsPayload> {
  const supabase = createAdminClient();

  /*
    公開中の投稿だけを通す（fail closed）。

    この経路は未ログインでも到達する公開 API で、admin クライアントが RLS を
    迂回して読む。ここを絞らないと、既知の UUID を投げるだけで未投稿・公開停止の
    行まで resolver に渡り、原作 ID・原作者・利用数といった系譜のメタデータを
    引き出せてしまう（本文ではないが、取り消した投稿の情報は返してはいけない）。

    列を絞っているのは、本文列をそもそもメモリに載せないため。
  */
  const { data, error } = await supabase
    .from("generated_images")
    .select(
      "id, user_id, generation_type, source_post_id, source_author_id, generation_metadata"
    )
    .in("id", postIds)
    .eq("is_posted", true)
    .eq("moderation_status", "visible");

  if (error) {
    console.error("[prompt-actions] query failed:", error);
    throw new Error("PROMPT_ACTIONS_FETCH_FAILED");
  }

  const rows = (data ?? []) as OriginRow[];

  const [summaries, styleLinks] = await Promise.all([
    resolveSourcePromptSummaries(
      rows as Parameters<typeof resolveSourcePromptSummaries>[0],
      supabase
    ),
    resolveStylePresetLinks(supabase, rows),
  ]);

  return { summaries, styleLinks };
}

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
