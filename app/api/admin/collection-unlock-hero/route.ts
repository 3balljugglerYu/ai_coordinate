import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "generated-images";
const KEY_PATTERN = /^[a-z][a-z0-9_]{1,49}$/;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const MIN_DIMENSION = 256;
const MAX_DIMENSION = 4096;
// 解放お知らせのヒーロー画像はステッカー(透過 PNG/WebP)も写真(JPEG)も許容する。
const EXT_BY_FORMAT: Record<string, string> = {
  png: "png",
  webp: "webp",
  jpeg: "jpg",
};

function decodeBase64(input: string): Buffer {
  // data URL(data:image/png;base64,xxx) と 生base64 の両方を許容
  const comma = input.indexOf(",");
  const base64 =
    input.startsWith("data:") && comma >= 0 ? input.slice(comma + 1) : input;
  return Buffer.from(base64, "base64");
}

/**
 * POST /api/admin/collection-unlock-hero
 * 解放お知らせ初回モーダル(InitialUnlockModal)のヒーロー画像をアップロードする。
 * ユーザー表示用のため public バケット(generated-images)に保存し、保存パスと実寸を返す。
 * body: { categoryKey: string, imageBase64: string }
 */
export async function POST(request: NextRequest) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;
  const categoryKey =
    typeof record.categoryKey === "string" ? record.categoryKey : "";
  const imageBase64 =
    typeof record.imageBase64 === "string" ? record.imageBase64 : "";

  if (!KEY_PATTERN.test(categoryKey)) {
    return NextResponse.json({ error: "不正なカテゴリです" }, { status: 400 });
  }
  if (imageBase64.length === 0) {
    return NextResponse.json({ error: "画像がありません" }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = decodeBase64(imageBase64);
  } catch {
    return NextResponse.json(
      { error: "画像のデコードに失敗しました" },
      { status: 400 },
    );
  }
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "画像サイズが不正です(最大10MB)" },
      { status: 400 },
    );
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    return NextResponse.json(
      { error: "画像を解析できませんでした" },
      { status: 400 },
    );
  }
  const format = meta.format ?? "";
  const ext = EXT_BY_FORMAT[format];
  if (!ext) {
    return NextResponse.json(
      { error: "PNG / WebP / JPEG 画像のみ対応しています" },
      { status: 400 },
    );
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
  const contentType = `image/${format}`;
  const path = `collection-unlock-heroes/${categoryKey}/${randomUUID()}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (uploadError) {
    console.error("[collection-unlock-hero] upload failed:", uploadError);
    return NextResponse.json(
      { error: "アップロードに失敗しました" },
      { status: 500 },
    );
  }

  return NextResponse.json({ path, width, height });
}
