import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { convertToWebP } from "@/features/generation/lib/webp-converter";
import {
  ANNOUNCEMENT_ALLOWED_MIME_TYPES,
  ANNOUNCEMENT_MAX_FILE_SIZE,
  type AnnouncementImageUploadResult,
} from "./schema";

const STORAGE_BUCKET = "announcement-images";

async function ensureAnnouncementBucket(
  supabase: ReturnType<typeof createAdminClient>
) {
  const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, {
    public: true,
    fileSizeLimit: ANNOUNCEMENT_MAX_FILE_SIZE,
    allowedMimeTypes: [...ANNOUNCEMENT_ALLOWED_MIME_TYPES],
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
    console.error("Announcement bucket creation error:", error);
    throw new Error(`バケットの作成に失敗しました: ${message}`);
  }
}

export async function uploadAnnouncementImage(
  file: File,
  fileId: string = crypto.randomUUID()
): Promise<AnnouncementImageUploadResult> {
  const supabase = createAdminClient();
  await ensureAnnouncementBucket(supabase);

  const arrayBuffer = await file.arrayBuffer();
  const imageBuffer = Buffer.from(arrayBuffer);
  const webpBuffer = await convertToWebP(imageBuffer, {
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 85,
  });
  const metadata = await sharp(webpBuffer).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("画像サイズの取得に失敗しました");
  }

  const storagePath = `${fileId}.webp`;
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, webpBuffer, {
      contentType: "image/webp",
      upsert: false,
    });

  if (error) {
    console.error("Announcement image upload error:", error);
    throw new Error(`画像のアップロードに失敗しました: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);

  return {
    publicUrl,
    storagePath: data.path,
    width: metadata.width,
    height: metadata.height,
  };
}

export async function deleteAnnouncementImages(
  storagePaths: Array<string | null | undefined>
): Promise<void> {
  const uniquePaths = [...new Set(storagePaths.filter(Boolean))];
  if (uniquePaths.length === 0) {
    return;
  }

  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove(uniquePaths as string[]);

  if (error) {
    console.error("Announcement image delete error:", error);
    throw new Error(`画像の削除に失敗しました: ${error.message}`);
  }
}
