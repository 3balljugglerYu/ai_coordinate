import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { convertToWebP } from "@/features/generation/lib/webp-converter";
import {
  STYLE_PRESET_ALLOWED_MIME_TYPES,
  STYLE_PRESET_MAX_FILE_SIZE,
} from "./schema";

const STORAGE_BUCKET = "style_presets";

async function ensureStylePresetBucket(
  supabase: ReturnType<typeof createAdminClient>
) {
  const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, {
    public: true,
    fileSizeLimit: STYLE_PRESET_MAX_FILE_SIZE,
    allowedMimeTypes: [...STYLE_PRESET_ALLOWED_MIME_TYPES],
  });

  if (!error) {
    return;
  }

  const statusCode =
    "statusCode" in error
      ? String((error as { statusCode?: string }).statusCode)
      : "";
  const message = error.message ?? "";
  const isAlreadyExists =
    statusCode === "409" || message.toLowerCase().includes("already exists");

  if (!isAlreadyExists) {
    console.error("Style preset bucket creation error:", error);
    throw new Error(`バケットの作成に失敗しました: ${message}`);
  }
}

export async function uploadStylePresetImage(
  file: File,
  presetId: string,
  fileId: string
): Promise<{
  imageUrl: string;
  storagePath: string;
  width: number;
  height: number;
}> {
  const supabase = createAdminClient();
  await ensureStylePresetBucket(supabase);

  const arrayBuffer = await file.arrayBuffer();
  const imageBuffer = Buffer.from(arrayBuffer);
  const webpBuffer = await convertToWebP(imageBuffer, {
    maxWidth: 1280,
    maxHeight: 1280,
    quality: 85,
  });

  const metadata = await sharp(webpBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("画像サイズの取得に失敗しました");
  }

  const storagePath = `${presetId}/${fileId}.webp`;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, webpBuffer, {
      contentType: "image/webp",
      upsert: false,
    });

  if (error) {
    console.error("Style preset image upload error:", error);
    throw new Error(`画像のアップロードに失敗しました: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);

  return {
    imageUrl: publicUrl,
    storagePath: data.path,
    width: metadata.width,
    height: metadata.height,
  };
}

export async function deleteStylePresetImage(
  storagePath: string | null | undefined
): Promise<void> {
  if (!storagePath) {
    return;
  }

  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([storagePath]);

  if (error) {
    console.error("Style preset image delete error:", error);
    throw new Error(`画像の削除に失敗しました: ${error.message}`);
  }
}
