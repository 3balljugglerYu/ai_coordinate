import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { convertToWebP } from "@/features/generation/lib/webp-converter";
import { POPUP_BANNER_MAX_FILE_SIZE } from "./schema";

const STORAGE_BUCKET = "popup-banners";
const TARGET_ASPECT_RATIO = 3 / 4;
const ASPECT_RATIO_TOLERANCE = 0.05;

async function ensurePopupBannerBucket(
  supabase: ReturnType<typeof createAdminClient>
) {
  const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, {
    public: true,
    fileSizeLimit: POPUP_BANNER_MAX_FILE_SIZE,
    allowedMimeTypes: ["image/webp", "image/jpeg", "image/png"],
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
    console.error("Popup banner bucket creation error:", error);
    throw new Error(`バケットの作成に失敗しました: ${message}`);
  }
}

function validatePopupBannerAspectRatio(width: number, height: number) {
  const aspectRatio = width / height;
  if (Math.abs(aspectRatio - TARGET_ASPECT_RATIO) > ASPECT_RATIO_TOLERANCE) {
    throw new Error("画像は3:4に近い縦長アスペクト比でアップロードしてください");
  }
}

export async function uploadPopupBannerImage(
  file: File,
  bannerId: string
): Promise<{ imageUrl: string; storagePath: string }> {
  const supabase = createAdminClient();
  await ensurePopupBannerBucket(supabase);

  const arrayBuffer = await file.arrayBuffer();
  const imageBuffer = Buffer.from(arrayBuffer);
  const metadata = await sharp(imageBuffer).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("画像サイズの取得に失敗しました");
  }

  validatePopupBannerAspectRatio(metadata.width, metadata.height);

  const webpBuffer = await convertToWebP(imageBuffer, {
    maxHeight: 1280,
    quality: 85,
  });

  const storagePath = `${bannerId}.webp`;
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, webpBuffer, {
      contentType: "image/webp",
      upsert: true,
    });

  if (error) {
    console.error("Popup banner upload error:", error);
    throw new Error(`画像のアップロードに失敗しました: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);

  return {
    imageUrl: publicUrl,
    storagePath: data.path,
  };
}

export async function deletePopupBannerImage(
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
    console.error("Popup banner delete error:", error);
    throw new Error(`画像の削除に失敗しました: ${error.message}`);
  }
}
