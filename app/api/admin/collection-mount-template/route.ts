import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { createAdminClient } from "@/lib/supabase/admin";

const TEMPLATE_BUCKET = "collection-mount-templates";
const KEY_PATTERN = /^[a-z][a-z0-9_]{1,49}$/;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB(バケットの file_size_limit と一致)
const MIN_DIMENSION = 256;
const MAX_DIMENSION = 4096;

function decodeBase64Png(input: string): Buffer {
  // data URL(data:image/png;base64,xxx) と 生base64 の両方を許容
  const comma = input.indexOf(",");
  const base64 = input.startsWith("data:") && comma >= 0 ? input.slice(comma + 1) : input;
  return Buffer.from(base64, "base64");
}

/**
 * POST /api/admin/collection-mount-template
 * 台紙テンプレ(キャラを抜いた空PNG)を collection-mount-templates バケットへ
 * アップロードし、保存パスを返す。admin 専用(service_role で書き込み)。
 * body: { categoryKey: string, imageBase64: string }
 */
export async function POST(request: NextRequest) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;
  const categoryKey = typeof record.categoryKey === "string" ? record.categoryKey : "";
  const imageBase64 = typeof record.imageBase64 === "string" ? record.imageBase64 : "";

  if (!KEY_PATTERN.test(categoryKey)) {
    return NextResponse.json({ error: "不正なカテゴリです" }, { status: 400 });
  }
  if (imageBase64.length === 0) {
    return NextResponse.json({ error: "画像がありません" }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = decodeBase64Png(imageBase64);
  } catch {
    return NextResponse.json({ error: "画像のデコードに失敗しました" }, { status: 400 });
  }
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "画像サイズが不正です(最大10MB)" }, { status: 400 });
  }

  // MIME/寸法の検証(PNG のみ・許容寸法内)
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    return NextResponse.json({ error: "画像を解析できませんでした" }, { status: 400 });
  }
  if (meta.format !== "png") {
    return NextResponse.json({ error: "PNG 画像のみ対応しています" }, { status: 400 });
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (
    width < MIN_DIMENSION ||
    height < MIN_DIMENSION ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION
  ) {
    return NextResponse.json(
      { error: `画像の寸法が不正です(${MIN_DIMENSION}〜${MAX_DIMENSION}px)` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const path = `${categoryKey}/${randomUUID()}.png`;
  const { error: uploadError } = await admin.storage
    .from(TEMPLATE_BUCKET)
    .upload(path, buffer, { contentType: "image/png", upsert: false });
  if (uploadError) {
    console.error("[collection-mount-template] upload failed:", uploadError);
    return NextResponse.json({ error: "アップロードに失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ path, width, height });
}
