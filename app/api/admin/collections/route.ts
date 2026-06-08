import { connection, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPresetCategoryByKey } from "@/features/style-presets/lib/preset-category-repository";
import { getCollectionKpi } from "@/features/admin-dashboard/lib/get-collection-kpi";
import { getCollectionCompleters } from "@/features/admin-dashboard/lib/get-collection-completions";

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,49}$/;
const PAGE_SIZE = 20;

/**
 * GET /api/admin/collections?categoryKey=...&page=0
 * 指定シリーズの KPI と達成者一覧(ページング)を返す。admin 専用。
 */
export async function GET(request: NextRequest) {
  await connection();

  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const categoryKey = request.nextUrl.searchParams.get("categoryKey") ?? "";
  const pageRaw = request.nextUrl.searchParams.get("page") ?? "0";
  const page = Number.parseInt(pageRaw, 10);

  if (!KEY_PATTERN.test(categoryKey)) {
    return NextResponse.json({ error: "invalid categoryKey" }, { status: 400 });
  }

  const category = await getPresetCategoryByKey(categoryKey);
  if (!category || !category.isCollectionSeries) {
    return NextResponse.json(
      { error: "not a collection series" },
      { status: 404 },
    );
  }

  try {
    const [kpi, completers] = await Promise.all([
      getCollectionKpi({ categoryKey, categoryId: category.id }),
      getCollectionCompleters({
        categoryKey,
        page: Number.isFinite(page) ? page : 0,
        pageSize: PAGE_SIZE,
      }),
    ]);
    return NextResponse.json({ kpi, completers });
  } catch (error) {
    console.error("[admin collections GET] failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
