export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
] as const;

export const ALLOWED_IMAGE_MIME_TYPE_SET = new Set<string>(
  ALLOWED_IMAGE_MIME_TYPES
);
