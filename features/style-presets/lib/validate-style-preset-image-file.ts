import {
  STYLE_PRESET_ALLOWED_MIME_TYPES,
  STYLE_PRESET_MAX_FILE_SIZE,
} from "./schema";

export function validateStylePresetImageFile(file: File): string | null {
  if (
    !STYLE_PRESET_ALLOWED_MIME_TYPES.includes(
      file.type as (typeof STYLE_PRESET_ALLOWED_MIME_TYPES)[number]
    )
  ) {
    return `許可されていないファイル形式です。対応: ${STYLE_PRESET_ALLOWED_MIME_TYPES.join(
      ", "
    )}`;
  }

  if (file.size > STYLE_PRESET_MAX_FILE_SIZE) {
    return "ファイルサイズは5MB以下にしてください";
  }

  return null;
}
