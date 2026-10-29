import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import { parseCsv } from "@/features/admin-dashboard/lib/ad-stats/parse-csv";
import { readXlsx, XlsxReadError } from "@/features/admin-dashboard/lib/ad-stats/read-xlsx";
import {
  AdExportFormatError,
  parseAdExport,
  type AdExportTable,
} from "@/features/admin-dashboard/lib/ad-stats/parse-ad-export";
import { saveAdExport } from "@/features/admin-dashboard/lib/ad-stats/ad-stats-repository";

/** Vercel の関数が受け取れる大きさ（約4.5MB）より小さくする。広告の書き出しは数百KB */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function toTables(bytes: Uint8Array): AdExportTable[] {
  if (isZip(bytes)) return readXlsx(bytes);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AdExportFormatError(
      "CSV の文字コードが UTF-8 ではありません。広告の画面から書き出したままのファイルを選んでください",
    );
  }
  return [{ name: "", rows: parseCsv(text) }];
}

/**
 * POST: 広告の書き出し（Meta の CSV / X の xlsx）を取り込む（multipart の file）。
 * 同じ日・広告・内訳は上書きするので、同じファイルを何度取り込んでも同じ結果になる。
 */
export async function POST(request: NextRequest) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "ファイルを受け取れませんでした" }, { status: 400 });
  }
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "ファイルを選んでください" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "ファイルが大きすぎます（4MBまで）" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseAdExport(toTables(new Uint8Array(await file.arrayBuffer())));
  } catch (error) {
    if (error instanceof AdExportFormatError || error instanceof XlsxReadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[admin ad-stats import] parse error:", error);
    return NextResponse.json({ error: "ファイルを読めませんでした" }, { status: 400 });
  }
  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { error: "取り込む数字がありません（使った額と表示がすべて0です）" },
      { status: 400 },
    );
  }

  const dates = parsed.rows.map((row) => row.statDate).sort();
  const summary = {
    platform: parsed.platform,
    rows: parsed.rows.length,
    ads: parsed.ads.length,
    dateFrom: dates[0],
    dateTo: dates[dates.length - 1],
    breakdowns: [...new Set(parsed.rows.map((row) => row.breakdownType))],
  };

  try {
    await saveAdExport(parsed, adminUser.id);
  } catch (error) {
    console.error("[admin ad-stats import] save error:", error);
    return NextResponse.json(
      { error: "保存に失敗しました。同じファイルをもう一度取り込んでください（同じ日の数字は上書きされます）" },
      { status: 500 },
    );
  }

  await logAdminAction({
    adminUserId: adminUser.id,
    actionType: "ad_stats_import",
    targetType: "ad_platform_daily_stats",
    metadata: { ...summary, fileName: file instanceof File ? file.name : null },
  });
  return NextResponse.json(summary, { status: 201 });
}
