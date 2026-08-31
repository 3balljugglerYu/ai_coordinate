import { connection, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getCreditsSummary } from "@/features/admin-dashboard/lib/get-credits-summary";

export async function GET() {
  await connection();
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  try {
    const { items, totals } = await getCreditsSummary();
    return NextResponse.json({ items, totals });
  } catch (error) {
    console.error("Credits summary error:", error);
    return NextResponse.json(
      { error: "残高の取得に失敗しました" },
      { status: 500 }
    );
  }
}
