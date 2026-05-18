import { connection, NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getMyImagesServer } from "@/features/my-page/lib/server-api";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getMyPageRouteCopy } from "@/features/my-page/lib/route-copy";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BULK_DELETE_MAX = 50;

/**
 * マイページ画像一覧取得API
 */
export async function GET(request: NextRequest) {
  await connection();
  const copy = getMyPageRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "MY_PAGE_AUTH_REQUIRED", 401);
    }
    const searchParams = request.nextUrl.searchParams;
    const filter = (searchParams.get("filter") || "all") as "all" | "posted" | "unposted";
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const images = await getMyImagesServer(user.id, filter, limit, offset);

    return NextResponse.json({
      images,
      hasMore: images.length === limit,
    });
  } catch (error) {
    console.error("My page images API error:", error);
    return jsonError(copy.imageFetchFailed, "MY_PAGE_IMAGES_FETCH_FAILED", 500);
  }
}

/**
 * マイページ画像の一括削除API。
 *
 * 仕様:
 * - 認証必須・本人所有のみ削除可
 * - 未投稿（is_posted = false）のみ削除対象。投稿済みが含まれていたら failed として返す
 * - 1 リクエストで {@link BULK_DELETE_MAX} 件まで
 * - DB 削除（generated_images）と Storage 削除（生成画像本体 + Before）を行う
 * - 部分失敗を許容し、`{ deleted: string[], failed: string[] }` を返す
 */
export async function DELETE(request: NextRequest) {
  await connection();
  const copy = getMyPageRouteCopy(getRouteLocale(request));

  let imageIds: string[];
  try {
    const body = (await request.json()) as { imageIds?: unknown };
    if (!Array.isArray(body.imageIds)) {
      return jsonError(
        copy.bulkDeleteInvalidInput,
        "MY_PAGE_BULK_DELETE_INVALID_INPUT",
        400,
      );
    }
    const normalized = body.imageIds
      .filter((id): id is string => typeof id === "string")
      .map((id) => id.trim())
      .filter((id) => UUID_PATTERN.test(id));

    // 重複は無害だが余計な往復を避けるため除外する
    imageIds = Array.from(new Set(normalized));

    if (imageIds.length === 0 || imageIds.length > BULK_DELETE_MAX) {
      return jsonError(
        copy.bulkDeleteInvalidInput,
        "MY_PAGE_BULK_DELETE_INVALID_INPUT",
        400,
      );
    }
  } catch {
    return jsonError(
      copy.bulkDeleteInvalidInput,
      "MY_PAGE_BULK_DELETE_INVALID_INPUT",
      400,
    );
  }

  const user = await getUser();
  if (!user) {
    return jsonError(copy.authRequired, "MY_PAGE_AUTH_REQUIRED", 401);
  }

  const supabase = await createClient();

  // 対象画像をまとめて取得（RLS により本人レコードのみ返る前提で user_id も明示）
  const { data: rows, error: fetchError } = await supabase
    .from("generated_images")
    .select("id, is_posted, storage_path, pre_generation_storage_path")
    .eq("user_id", user.id)
    .in("id", imageIds);

  if (fetchError) {
    console.error("Bulk delete fetch error:", fetchError);
    return jsonError(
      copy.bulkDeleteFailed,
      "MY_PAGE_BULK_DELETE_FAILED",
      500,
    );
  }

  const eligibleRows = (rows ?? []).filter((row) => row.is_posted === false);
  const eligibleIds = eligibleRows.map((row) => row.id);
  const eligibleIdSet = new Set(eligibleIds);

  // 対象外（見つからない・投稿済み）は failed として返す
  const initialFailed = imageIds.filter((id) => !eligibleIdSet.has(id));

  if (eligibleIds.length === 0) {
    return NextResponse.json({ deleted: [], failed: initialFailed });
  }

  // Storage 削除（失敗してもログのみで継続。既存単一削除と同じ挙動）
  const storagePaths = eligibleRows.flatMap((row) => {
    const paths: string[] = [];
    if (row.storage_path) paths.push(row.storage_path);
    if (row.pre_generation_storage_path) {
      paths.push(row.pre_generation_storage_path);
    }
    return paths;
  });

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from("generated-images")
      .remove(storagePaths);
    if (storageError) {
      console.error("Bulk delete storage error:", storageError);
    }
  }

  // DB 削除
  const { error: deleteError } = await supabase
    .from("generated_images")
    .delete()
    .in("id", eligibleIds)
    .eq("user_id", user.id);

  if (deleteError) {
    console.error("Bulk delete db error:", deleteError);
    return NextResponse.json({
      deleted: [],
      failed: [...initialFailed, ...eligibleIds],
    });
  }

  return NextResponse.json({
    deleted: eligibleIds,
    failed: initialFailed,
  });
}
