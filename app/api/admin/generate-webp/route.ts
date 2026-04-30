import { connection, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureWebPVariants } from "@/features/generation/lib/webp-storage";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

type GenerateWebPScope = "posted" | "all";

function getScope(request: NextRequest): GenerateWebPScope {
  return request.nextUrl.searchParams.get("scope") === "all" ? "all" : "posted";
}

function getLimit(request: NextRequest): number {
  const limit = Number.parseInt(
    request.nextUrl.searchParams.get("limit") || String(DEFAULT_LIMIT),
    10
  );
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(limit, 1), MAX_LIMIT);
}

function getOffset(request: NextRequest): number {
  const offset = Number.parseInt(request.nextUrl.searchParams.get("offset") || "0", 10);
  if (!Number.isFinite(offset)) {
    return 0;
  }

  return Math.max(offset, 0);
}

function buildMissingWebPQuery(
  supabase: ReturnType<typeof createAdminClient>,
  scope: GenerateWebPScope
) {
  let query = supabase
    .from("generated_images")
    .select(
      "id, user_id, image_url, storage_path, storage_path_display, storage_path_thumb, is_posted, posted_at, created_at"
    )
    .or("storage_path_display.is.null,storage_path_thumb.is.null")
    .not("storage_path", "is", null)
    .not("image_url", "is", null);

  if (scope === "posted") {
    query = query
      .eq("is_posted", true)
      .order("posted_at", { ascending: false })
      .order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: true });
  }

  return query;
}

function buildMissingWebPCountQuery(
  supabase: ReturnType<typeof createAdminClient>,
  scope: GenerateWebPScope
) {
  let query = supabase
    .from("generated_images")
    .select("*", { count: "exact", head: true })
    .or("storage_path_display.is.null,storage_path_thumb.is.null")
    .not("storage_path", "is", null)
    .not("image_url", "is", null);

  if (scope === "posted") {
    query = query.eq("is_posted", true);
  }

  return query;
}

/**
 * 既存資産のWebP生成バッチ処理API
 * 既存のgenerated_imagesからWebPが未生成の画像を取得してWebP変換を実行
 * 
 * クエリパラメータ:
 * - scope: posted | all（デフォルト: posted）
 * - limit: 1回あたりの処理件数（デフォルト: 10）
 * - offset: オフセット（デフォルト: 0）
 */
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAdmin();
    } catch (error) {
      if (error instanceof NextResponse) {
        return error;
      }
      throw error;
    }

    const supabase = createAdminClient();
    const scope = getScope(request);
    const limit = getLimit(request);
    const offset = getOffset(request);

    const { data: images, error: fetchError } = await buildMissingWebPQuery(
      supabase,
      scope
    )
      .range(offset, offset + limit - 1);

    if (fetchError) {
      console.error("画像取得エラー:", fetchError);
      return NextResponse.json(
        { error: `画像の取得に失敗しました: ${fetchError.message}` },
        { status: 500 }
      );
    }

    if (!images || images.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        total: 0,
        scope,
        message: "処理対象の画像がありません",
      });
    }

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as Array<{ id: string; error: string }>,
    };

    for (const image of images) {
      try {
        const result = await ensureWebPVariants(image.id, { image });

        if (result.status === "skipped") {
          results.skipped++;
        } else {
          results.success++;
        }
      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : "不明なエラー";
        results.errors.push({
          id: image.id,
          error: errorMessage,
        });
        console.error(`画像ID ${image.id} のWebP生成に失敗しました:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      processed: images.length,
      results: {
        success: results.success,
        failed: results.failed,
        skipped: results.skipped,
        errors: results.errors,
      },
      scope,
      nextOffset: offset + images.length,
    });
  } catch (error) {
    console.error("バッチ処理エラー:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "バッチ処理に失敗しました",
        success: false,
      },
      { status: 500 }
    );
  }
}

/**
 * 処理対象の画像数を取得
 */
export async function GET(request: NextRequest) {
  await connection();
  try {
    try {
      await requireAdmin();
    } catch (error) {
      if (error instanceof NextResponse) {
        return error;
      }
      throw error;
    }

    const supabase = createAdminClient();
    const scope = getScope(request);

    const { count, error } = await buildMissingWebPCountQuery(supabase, scope);

    if (error) {
      console.error("画像数取得エラー:", error);
      return NextResponse.json(
        { error: `画像数の取得に失敗しました: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: count || 0,
      scope,
    });
  } catch (error) {
    console.error("画像数取得エラー:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "画像数の取得に失敗しました",
        success: false,
      },
      { status: 500 }
    );
  }
}
