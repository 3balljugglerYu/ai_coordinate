import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { isAdminViewer } from "@/lib/env";
import { isCollectionDisplayPeriodActive } from "@/features/collections/lib/collection-display-period";
import { resolveMountSlots } from "@/features/collections/lib/mount-layouts";
import { composeMount } from "@/features/collections/lib/compose-mount";
import {
  composeMountOgp,
  composeMountOgpFromTemplate,
  composeDefaultOgp,
  DEFAULT_OGP_TEMPLATE_PATH,
  ogpPathFromMountPath,
  parseOgpMountPlacement,
} from "@/features/collections/lib/compose-mount-ogp";
import { getRepresentativeImagesForCategory } from "@/features/collections/lib/representative-images";
import { refreshCompletionFeedPostImage } from "@/features/collections/lib/completion-feed-post";
import { resolveSelectedImages } from "@/features/collections/lib/resolve-selected-images";
import { recordStyleUsageEvent } from "@/features/style/lib/style-usage-events";
import type { ReserveCollectionResultRow } from "@/features/collections/lib/collection-types";

// 注: 本リポジトリは Next.js 16 Cache Components 有効のため route segment config
// (export const runtime) は使用不可。API Route はデフォルトで Node ランタイムで動き、
// sharp(Node) もそのまま利用できる。

const GENERATED_IMAGES_BUCKET = "generated-images";
const TEMPLATE_BUCKET = "collection-mount-templates";
const CATEGORY_KEY_PATTERN = /^[a-z][a-z0-9_]{1,49}$/;

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, errorCode: code }, { status });
}

/**
 * 台紙を作り直したとき、ホームに投稿済みの完走フィード投稿サムネも最新へ貼り替える。
 * 投稿していなければ何もしない。best-effort(失敗しても作り直しは成功扱い)。
 * 貼り替えたらフィード/詳細/検索の cache を失効させ、新サムネを反映する。
 */
async function refreshCompletionFeedPost(
  userId: string,
  completionId: string,
  mountStoragePath: string,
): Promise<void> {
  const { postId } = await refreshCompletionFeedPostImage(
    createAdminClient(),
    completionId,
    mountStoragePath,
  );
  if (!postId) return;
  revalidateTag("home-posts", "max");
  revalidateTag("home-posts-week", "max");
  revalidateTag("search-posts", "max");
  // 本人プロフィールの投稿一覧サムネも更新(完走投稿ルートと同じタグ群)。
  revalidateTag(`user-profile-${userId}`, "max");
  revalidateTag(`post-detail-${postId}`, { expire: 0 });
}

/**
 * 完走報酬の付与(docs/planning/collection-completion-reward-implementation-plan.md)。
 * finalize_collection_completion 成功直後にのみ呼ぶ。冪等は RPC 内の
 * reward_granted_at test-and-set が担保。失敗しても完走レスポンスを妨げない
 * (EARS-07: ログのみ残して 0 を返す)。戻り値=実付与額(キャップ後)。
 */
async function grantCompletionReward(
  admin: ReturnType<typeof createAdminClient>,
  completionId: string,
  userId: string,
): Promise<number> {
  try {
    const { data, error } = await admin.rpc(
      "grant_collection_completion_reward",
      {
        p_completion_id: completionId,
        p_user_id: userId,
      },
    );
    if (error) {
      console.error("[collections mount] completion reward grant failed:", error);
      return 0;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const amount =
      typeof row?.amount_granted === "number" ? row.amount_granted : 0;
    if (amount > 0) {
      // 残高表示系キャッシュを更新(tutorial/complete の付与と同じタグ群)。
      // collection-completions: タグはコレクション表示専用で残高には効かない。
      revalidateTag(`my-page-credits-${userId}`, "max");
      revalidateTag(`my-page-${userId}`, "max");
      revalidateTag(`challenge-${userId}`, "max");
      revalidateTag(`coordinate-${userId}`, "max");
    }
    return amount;
  } catch (grantError) {
    console.error("[collections mount] completion reward grant failed:", grantError);
    return 0;
  }
}

async function downloadBuffer(
  admin: ReturnType<typeof createAdminClient>,
  bucket: string,
  path: string,
): Promise<Buffer> {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`download failed (${bucket}/${path}): ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function POST(request: NextRequest) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  // 1) 認証(セッションから user を解決。client の user_id は信用しない)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError("ログインが必要です", "UNAUTHENTICATED", 401);
  }

  // 2) 入力(categoryKey + 任意 selections)
  let categoryKey: unknown;
  let selectionsRaw: unknown;
  try {
    const body = await request.json();
    categoryKey = body?.categoryKey;
    selectionsRaw = body?.selections;
  } catch {
    return jsonError("不正なリクエストです", "INVALID_BODY", 400);
  }
  if (typeof categoryKey !== "string" || !CATEGORY_KEY_PATTERN.test(categoryKey)) {
    return jsonError("不正なカテゴリです", "INVALID_CATEGORY_KEY", 400);
  }
  // selections は { [presetId]: generatedImageId } の plain object のみ許容
  let selections: Record<string, string> | null = null;
  if (selectionsRaw !== undefined && selectionsRaw !== null) {
    if (
      typeof selectionsRaw !== "object" ||
      Array.isArray(selectionsRaw) ||
      !Object.entries(selectionsRaw as Record<string, unknown>).every(
        ([k, v]) => typeof k === "string" && typeof v === "string",
      )
    ) {
      return jsonError("不正な選択です", "INVALID_SELECTIONS", 400);
    }
    selections = selectionsRaw as Record<string, string>;
  }

  // 2.5) 表示期間ガード。期間外は「達成済み(completed)ユーザーのカード更新」のみ
  // 許可する(ユーザー視点と同じ見え方になるよう、期間は admin にも適用)。
  // reserve より前に弾くことで、期間外の未達成ユーザーが completion 行を
  // 新規作成してしまうのを防ぐ。
  const adminForGuard = createAdminClient();
  const { data: categoryGuard } = await adminForGuard
    .from("preset_categories")
    .select("id, visibility, collection_display_starts_at, collection_display_ends_at")
    .eq("key", categoryKey)
    .eq("is_collection_series", true)
    .eq("is_active", true)
    .maybeSingle();
  if (!categoryGuard) {
    return jsonError("コレクションが見つかりません", "CATEGORY_NOT_FOUND", 404);
  }
  const isAdmin = isAdminViewer(user.id);
  if (categoryGuard.visibility !== "public" && !isAdmin) {
    return jsonError("コレクションが見つかりません", "CATEGORY_NOT_FOUND", 404);
  }
  const periodActive = isCollectionDisplayPeriodActive({
    collectionDisplayStartsAt:
      (categoryGuard.collection_display_starts_at as string | null) ?? null,
    collectionDisplayEndsAt:
      (categoryGuard.collection_display_ends_at as string | null) ?? null,
  });
  if (!periodActive) {
    const { data: completed } = await adminForGuard
      .from("collection_completions")
      .select("id")
      .eq("user_id", user.id)
      .eq("category_id", categoryGuard.id as string)
      .eq("mount_status", "completed")
      .maybeSingle();
    if (!completed) {
      return jsonError(
        "コレクションの開催期間外です",
        "OUT_OF_DISPLAY_PERIOD",
        403,
      );
    }
  }

  // 3) 予約(N到達をサーバー側で再検証。冪等)
  const { data: reserveData, error: reserveError } = await supabase.rpc(
    "reserve_collection_completion",
    { p_category_key: categoryKey, p_allow_admin_only: isAdmin },
  );
  if (reserveError) {
    // threshold_not_reached / collection_series_not_found 等はクライアント起因
    return jsonError("カードを生成できませんでした", "RESERVE_FAILED", 400);
  }
  const reserved = (
    Array.isArray(reserveData) ? reserveData[0] : reserveData
  ) as ReserveCollectionResultRow | undefined;
  if (!reserved) {
    return jsonError("カードを生成できませんでした", "RESERVE_EMPTY", 500);
  }

  const admin = createAdminClient();
  const completionId = reserved.completion_id;
  // ファイルパスにタイムスタンプを含め、初回/更新ごとに URL が変わるようにする。
  // これによりブラウザ/CDN/OGP キャッシュが自然と新しい画像を取得する。
  const mountStoragePath = `collection-mounts/${user.id}/${categoryKey}/mount-${Date.now()}.png`;
  const { data: publicUrlData } = admin.storage
    .from(GENERATED_IMAGES_BUCKET)
    .getPublicUrl(mountStoragePath);
  const mountImageUrl = publicUrlData.publicUrl;
  const sharePath = `/m/${completionId}`;

  // 既に完了済みのカードに対する「選択を変えて作り直す(=更新)」リクエストは許可する。
  // 競合(generating 進行中 / failed リトライ未準備)は従来通りハンドル。
  const isUpdate = reserved.mount_status === "completed";
  if (!isUpdate) {
    if (reserved.mount_status === "generating" && reserved.newly_reserved === false) {
      return NextResponse.json(
        { status: "generating", sharePath },
        { status: 202 },
      );
    }
    if (reserved.mount_status === "failed" && reserved.newly_reserved === false) {
      return jsonError("カード生成の再試行準備ができていません", "MOUNT_RETRY_NOT_READY", 409);
    }
  }

  // 更新の場合は、削除対象として既存パスを控える(差し替え後にゴミ削除)
  let previousMountPath: string | null = null;
  if (isUpdate) {
    const { data: prev } = await admin
      .from("collection_completions")
      .select("mount_image_path")
      .eq("id", completionId)
      .eq("user_id", user.id)
      .maybeSingle();
    previousMountPath = (prev?.mount_image_path as string | null) ?? null;
  }

  // 4) 合成(generating)。失敗時は failed に落として 500。
  let uploadedPath: string | null = null;
  try {
    const { data: category, error: categoryError } = await admin
      .from("preset_categories")
      .select(
        "id, mount_template_path, mount_layout, mount_slots, mount_template_width, mount_template_height, completion_threshold, visibility, display_name_ja, ogp_template_path, ogp_mount_placement, completion_view_mode, book_cover_path",
      )
      .eq("key", categoryKey)
      .eq("is_collection_series", true)
      .eq("is_active", true)
      .single();
    if (categoryError || !category) {
      throw new Error(`category not found: ${categoryError?.message ?? categoryKey}`);
    }
    // 公開シリーズ、または admin/プレビュー admin のプレビューのみ許可
    if (category.visibility !== "public" && !isAdminViewer(user.id)) {
      throw new Error(`category not public: ${categoryKey}`);
    }

    // ===== book(めくれる日記帳)モード: 台紙合成をスキップし、ページ画像のスナップショット + 表紙OGP =====
    const completionViewMode: "mount" | "book" =
      (category as { completion_view_mode?: string | null })
        .completion_view_mode === "book"
        ? "book"
        : "mount";
    if (completionViewMode === "book") {
      const bookThreshold =
        typeof category.completion_threshold === "number"
          ? category.completion_threshold
          : null;
      if (!bookThreshold || bookThreshold <= 0) {
        throw new Error("collection settings incomplete (book threshold)");
      }
      // 採用ページ(selections 優先、無ければ各Day最新・sort_order順)
      const pageReps = selections
        ? await resolveSelectedImages({
            userId: user.id,
            categoryId: category.id as string,
            selections,
            slotCount: bookThreshold,
          })
        : await getRepresentativeImagesForCategory({
            userId: user.id,
            categoryId: category.id as string,
            limit: bookThreshold,
          });
      if (pageReps.length !== bookThreshold) {
        throw new Error(
          `book pages incomplete: ${pageReps.length} of ${bookThreshold}`,
        );
      }
      const bookPagePaths = pageReps.map((r) => r.storagePath);

      // 完走モーダル/マイページに出す画像 = 「はじまり(表紙=book_page_paths[0])」の生成画像を
      //   mount-{ts}.png(finalize 許可パターン)にコピーする。縦長なので 3:4 のモーダルにも収まる。
      //   (旧実装は横長 OGP バナーを敷いていたが、縦長モーダルに合わないため はじまり に変更)
      const coverBuf = await downloadBuffer(
        admin,
        GENERATED_IMAGES_BUCKET,
        bookPagePaths[0],
      );
      const { error: coverUploadErr } = await admin.storage
        .from(GENERATED_IMAGES_BUCKET)
        .upload(mountStoragePath, coverBuf, {
          contentType: "image/png",
          upsert: false,
        });
      if (coverUploadErr) {
        throw new Error(`book cover upload failed: ${coverUploadErr.message}`);
      }
      uploadedPath = mountStoragePath; // 後続失敗時のロールバック対象
      const bookMountPath = mountStoragePath;

      // X シェア用 OGP は mount のツイン ogp-{ts}.png に保存する(mount モードと同方式)。
      //   book はユーザー生成の「はじまり(表紙)」をそのまま OGP にする(A案 2026-07-11)。
      //   全員共通テンプレ(ogp_template_path)より「本人のうちの子が主役」を優先する意図。
      //   縦長画像のため X の大型カードでは中央帯(顔まわり)にクロップされる想定。
      const ogpTwinPath = ogpPathFromMountPath(mountStoragePath);
      if (ogpTwinPath) {
        try {
          // storage.upload は API レベルの失敗では throw せず { error } を返すため
          // 明示的に確認する(OGP失敗は完走をブロックしない方針のままログのみ)。
          const { error: ogpUploadError } = await admin.storage
            .from(GENERATED_IMAGES_BUCKET)
            .upload(ogpTwinPath, coverBuf, {
              contentType: "image/png",
              upsert: false,
            });
          if (ogpUploadError) {
            console.error("book OGP twin upload failed:", ogpUploadError);
          }
        } catch (e) {
          console.error("book OGP twin upload failed:", e);
        }
      }

      const bookSharePath = `/m/${completionId}/book`;
      let bookRewardGranted = 0;

      if (!isUpdate) {
        const { data: finalized, error: finalizeError } = await admin.rpc(
          "finalize_collection_completion",
          {
            p_completion_id: completionId,
            p_user_id: user.id,
            p_mount_image_path: bookMountPath,
          },
        );
        if (finalizeError) {
          throw new Error(`finalize failed: ${finalizeError.message}`);
        }
        if (finalized !== true) {
          throw new Error("finalize skipped: completion is not generating");
        }
        // finalize 成功後に採用ページを保存(failed 行に stale を残さない)。
        const { error: bookPagesError } = await admin
          .from("collection_completions")
          .update({ book_page_paths: bookPagePaths })
          .eq("id", completionId)
          .eq("user_id", user.id);
        if (bookPagesError) {
          throw new Error(`book pages save failed: ${bookPagesError.message}`);
        }
        revalidateTag(`collection-completions:${user.id}`, "max");
        // 完走報酬(finalize成功後のみ。作り直しでは呼ばれない)
        bookRewardGranted = await grantCompletionReward(
          admin,
          completionId,
          user.id,
        );
        await Promise.allSettled([
          recordStyleUsageEvent({
            userId: user.id,
            authState: "authenticated",
            eventType: "complete_achieved",
          }),
          recordStyleUsageEvent({
            userId: user.id,
            authState: "authenticated",
            eventType: "mount_generated",
          }),
        ]);
      } else {
        // 作り直し: mount_image_path と採用ページを更新。成功確認後にのみ旧ファイルを削除する
        //   (レガシー isUpdate と同等のエラーハンドリング)。
        const { error: updateError } = await admin
          .from("collection_completions")
          .update({
            mount_image_path: bookMountPath,
            book_page_paths: bookPagePaths,
          })
          .eq("id", completionId)
          .eq("user_id", user.id);
        if (updateError) {
          throw new Error(`book update failed: ${updateError.message}`);
        }
        revalidateTag(`collection-completions:${user.id}`, "max");
        // 完走をホームに投稿済みなら、そのサムネも新しい表紙へ貼り替える(best-effort)。
        await refreshCompletionFeedPost(user.id, completionId, bookMountPath);
        if (previousMountPath && previousMountPath !== bookMountPath) {
          // 旧 mount-{ts}.png と そのOGPツイン ogp-{ts}.png を削除(ベストエフォート)。
          const stale = [previousMountPath];
          const prevOgp = ogpPathFromMountPath(previousMountPath);
          if (prevOgp) stale.push(prevOgp);
          try {
            await admin.storage.from(GENERATED_IMAGES_BUCKET).remove(stale);
          } catch {
            // best effort
          }
        }
      }

      const bookOgpUrl = admin.storage
        .from(GENERATED_IMAGES_BUCKET)
        .getPublicUrl(bookMountPath).data.publicUrl;

      return NextResponse.json({
        status: "completed",
        mode: "book",
        sharePath: bookSharePath,
        mountImageUrl: bookOgpUrl,
        // 完走報酬の実付与額(0=報酬なし/付与失敗/作り直し)。祝賀ビューの演出用
        rewardGranted: bookRewardGranted,
      });
    }

    const templatePath = category.mount_template_path as string | null;
    const threshold =
      typeof category.completion_threshold === "number"
        ? category.completion_threshold
        : null;
    if (!templatePath) {
      throw new Error("collection settings incomplete (template)");
    }
    // mount_slots(カスタム枠)があれば優先、無ければ mount_layout のプリセットへフォールバック
    const slots = resolveMountSlots(category.mount_slots, category.mount_layout);
    const slotCount = slots.length;
    if (threshold !== slotCount) {
      throw new Error(`collection threshold/slots mismatch: ${threshold ?? "null"} vs ${slotCount}`);
    }

    const templatePng = await downloadBuffer(admin, TEMPLATE_BUCKET, templatePath);

    // selections 指定があれば「ユーザーが選んだ画像」を、無ければ衣装ごと最新を採用
    const reps = selections
      ? await resolveSelectedImages({
          userId: user.id,
          categoryId: category.id as string,
          selections,
          slotCount,
        })
      : await getRepresentativeImagesForCategory({
          userId: user.id,
          categoryId: category.id as string,
          limit: slotCount,
        });
    if (reps.length !== slotCount) {
      throw new Error(`representative images incomplete: ${reps.length} of ${slotCount}`);
    }
    const stickers = await Promise.all(
      reps.map((r) => downloadBuffer(admin, GENERATED_IMAGES_BUCKET, r.storagePath)),
    );

    const mountPng = await composeMount({ templatePng, stickers, slots });

    // パスにタイムスタンプが含まれるため毎回新規パス。事前 remove は不要。
    const { error: uploadError } = await admin.storage
      .from(GENERATED_IMAGES_BUCKET)
      .upload(mountStoragePath, mountPng, {
        contentType: "image/png",
        upsert: false,
      });
    if (uploadError) {
      throw new Error(`mount upload failed: ${uploadError.message}`);
    }
    uploadedPath = mountStoragePath;

    // OGP 用 1200x630(X summary_large_image / OGP 2:1) を併せて生成・アップ。
    // パスは mount-{ts}.png → ogp-{ts}.png の対応。失敗してもメイン処理は止めない。
    // カテゴリにデザインテンプレート(ogp_template_path)があればテンプレート合成、
    // 無ければ従来の SVG 合成。テンプレート起因の失敗は SVG 合成へフォールバック。
    try {
      const ogpPath = ogpPathFromMountPath(mountStoragePath);
      if (ogpPath) {
        const ogpTemplatePath = category.ogp_template_path as string | null;
        let ogpPng: Buffer | null = null;
        if (ogpTemplatePath) {
          // カテゴリ専用テンプレートあり: テンプレに台紙(カード)を合成する。
          try {
            const ogpTemplatePng = await downloadBuffer(
              admin,
              TEMPLATE_BUCKET,
              ogpTemplatePath,
            );
            ogpPng = await composeMountOgpFromTemplate({
              templatePng: ogpTemplatePng,
              mountPng,
              placement: parseOgpMountPlacement(category.ogp_mount_placement),
            });
          } catch (templateError) {
            console.error(
              "collection mount OGP template compose failed (fallback to default image):",
              templateError,
            );
          }
        } else {
          // テンプレート未設定カテゴリのデフォルト: 共通のブランドOGP画像を
          // そのまま使う(カード合成なし)。SVG プログラム生成は最終フォールバックに残す。
          try {
            const defaultPng = await downloadBuffer(
              admin,
              TEMPLATE_BUCKET,
              DEFAULT_OGP_TEMPLATE_PATH,
            );
            ogpPng = await composeDefaultOgp(defaultPng);
          } catch (defaultError) {
            console.error(
              "collection mount default OGP image failed (fallback to programmatic design):",
              defaultError,
            );
          }
        }
        // テンプレ/デフォルト画像とも取得失敗した場合の最終フォールバック(OGP 無しを避ける)。
        ogpPng ??= await composeMountOgp({
          mountPng,
          displayName: (category.display_name_ja as string | null) ?? "",
          threshold: threshold ?? undefined,
        });
        await admin.storage
          .from(GENERATED_IMAGES_BUCKET)
          .upload(ogpPath, ogpPng, {
            contentType: "image/png",
            upsert: false,
          });
      }
    } catch (ogpError) {
      console.error("collection mount OGP generation failed:", ogpError);
    }

    let rewardGranted = 0;
    if (!isUpdate) {
      // 5) 初回のみ finalize(generating → completed の遷移)。イベント記録もここだけ。
      const { data: finalized, error: finalizeError } = await admin.rpc(
        "finalize_collection_completion",
        {
          p_completion_id: completionId,
          p_user_id: user.id,
          p_mount_image_path: mountStoragePath,
        },
      );
      if (finalizeError) {
        throw new Error(`finalize failed: ${finalizeError.message}`);
      }
      if (finalized !== true) {
        throw new Error("finalize skipped: completion is not generating");
      }
      // マイページのコレクション表示(ユーザー別 cache)を更新
      revalidateTag(`collection-completions:${user.id}`, "max");
      // 完走報酬(finalize成功後のみ。作り直しでは呼ばれない)
      rewardGranted = await grantCompletionReward(admin, completionId, user.id);
      await Promise.allSettled([
        recordStyleUsageEvent({
          userId: user.id,
          authState: "authenticated",
          eventType: "complete_achieved",
        }),
        recordStyleUsageEvent({
          userId: user.id,
          authState: "authenticated",
          eventType: "mount_generated",
        }),
      ]);
    } else {
      // 更新時は finalize 不要(既に completed)だが、DB の mount_image_path を新パスへ
      // 差し替える(タイムスタンプ付きでサムネURL も自然と変わる)。
      const { error: updateError } = await admin
        .from("collection_completions")
        .update({ mount_image_path: mountStoragePath })
        .eq("id", completionId)
        .eq("user_id", user.id);
      if (updateError) {
        throw new Error(`mount_image_path update failed: ${updateError.message}`);
      }
      // 完走をホームに投稿済みなら、そのサムネも新しい台紙へ貼り替える(best-effort)。
      await refreshCompletionFeedPost(user.id, completionId, mountStoragePath);
      // 旧 mount + OGP は削除(残しても問題ないが容量節約)
      if (previousMountPath && previousMountPath !== mountStoragePath) {
        const oldOgpPath = ogpPathFromMountPath(previousMountPath);
        const toRemove = [previousMountPath];
        if (oldOgpPath) toRemove.push(oldOgpPath);
        await admin.storage
          .from(GENERATED_IMAGES_BUCKET)
          .remove(toRemove)
          .catch(() => {});
      }
      // マイページのコレクション表示(ユーザー別 cache)を更新
      revalidateTag(`collection-completions:${user.id}`, "max");
    }

    // ファイル名に毎回タイムスタンプが入るため URL 自体が変わる → 追加の v 付与は不要だが、
    // フォールバック的に付けておく。
    const versioned = `${mountImageUrl}?v=${Date.now()}`;
    return NextResponse.json({
      status: "completed",
      mountImageUrl: versioned,
      sharePath,
      mountTemplateWidth:
        (category.mount_template_width as number | null) ?? null,
      mountTemplateHeight:
        (category.mount_template_height as number | null) ?? null,
      // 完走報酬の実付与額(0=報酬なし/付与失敗/作り直し)。祝賀ビューの演出用
      rewardGranted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    if (uploadedPath) {
      await admin.storage.from(GENERATED_IMAGES_BUCKET).remove([uploadedPath]).catch(() => {});
    }
    try {
      await admin.rpc("fail_collection_completion", {
        p_completion_id: completionId,
        p_user_id: user.id,
        p_error: message.slice(0, 500),
      });
    } catch {
      // fail 記録自体の失敗は致命ではない(本体エラーを優先して返す)
    }
    console.error("collection mount generation failed:", message);
    return jsonError("カードの生成に失敗しました", "MOUNT_GENERATION_FAILED", 500);
  }
}
