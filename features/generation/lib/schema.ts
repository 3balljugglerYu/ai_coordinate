import { z } from "zod";
import {
  DEFAULT_GENERATION_MODEL,
  KNOWN_MODEL_INPUTS,
  normalizeModelName,
  backgroundModeToBackgroundChange,
  resolveBackgroundMode,
  BACKGROUND_MODES,
  SOURCE_IMAGE_TYPES,
} from "../types";
import { GENERATION_PROMPT_MAX_LENGTH } from "./prompt-validation";
import { FRAMING_MODES } from "@/shared/generation/framing-mode";
import { CREATOR_LOOKS_MODES } from "@/shared/generation/creator-looks-mode";

/**
 * 画像生成機能のZodスキーマ
 * APIの入力バリデーションに使用
 */

// 許可された画像MIMEタイプ
// 注意: HEIC/HEIFは変換処理を通るため、JPEG/PNGに変換される
const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const;

/**
 * MIMEタイプから安全に拡張子を取得
 * パストラバーサル攻撃を防ぐため、許可されたMIMEタイプのみを処理
 */
function getSafeExtensionFromMimeType(mimeType: string): string {
  // MIMEタイプを正規化（小文字、余分な空白を削除）
  const normalized = mimeType.toLowerCase().trim();
  
  // 許可されたMIMEタイプから拡張子をマッピング
  const mimeToExtension: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  
  return mimeToExtension[normalized] || 'png'; // デフォルトはpng
}

export const generationRequestSchema = z.object({
  prompt: z
    .string()
    .min(1, "着せ替え内容を入力してください")
    .max(
      GENERATION_PROMPT_MAX_LENGTH,
      `着せ替え内容は${GENERATION_PROMPT_MAX_LENGTH}文字以内で入力してください`
    ),
  sourceImageBase64: z.string().optional(),
  sourceImageMimeType: z
    .string()
    .optional()
    .refine(
      (val) => !val || ALLOWED_IMAGE_MIME_TYPES.includes(val.toLowerCase().trim() as typeof ALLOWED_IMAGE_MIME_TYPES[number]),
      {
        message: "許可されていない画像形式です。PNG、JPEG、WebP、GIF、HEIC（HEIF）のみ対応しています。",
      }
    ),
  sourceImageStockId: z.string().uuid().optional(),
  /**
   * 生成済み画像 (generated_images) を入力 source として再利用する場合の id。
   * クライアントは画像本体をアップロードせず、サーバー側で user_id を検証した上で
   * DB の image_url をそのまま流用する。stockId / base64 と排他。
   */
  sourceImageGeneratedId: z.string().uuid().optional(),
  sourceImageType: z.enum(SOURCE_IMAGE_TYPES).optional().default("illustration"),
  backgroundMode: z.enum(BACKGROUND_MODES).optional(),
  backgroundChange: z.boolean().optional(),
  count: z.number().int().min(1).max(4).optional().default(1),
  generationType: z
    .enum([
      'coordinate',
      'specified_coordinate',
      'full_body',
      'chibi',
      'one_tap_style',
      'inspire',
    ])
    .optional()
    .default('coordinate'),
  // 受理可能な model 値は types.ts の KNOWN_MODEL_INPUTS を単一の正本とする。
  // ゲスト sync 経路は同 enum を経由してから whitelist 判定するため、二重管理を避ける。
  model: z
    .enum(KNOWN_MODEL_INPUTS)
    .optional()
    .default(DEFAULT_GENERATION_MODEL)
    .transform(normalizeModelName), // データベース保存用に正規化
  /**
   * framing_mode。"free_pose"(既定)は image_0 の identity を維持しつつ、衣装/ポーズ/
   * カメラ/背景をユーザー指示に委ねる。"locked"(「維持」チェックON)は現行どおり厳密維持。
   * 全ログインユーザー対象 (ゲスト sync 経路は非対応)。
   * generationType='coordinate' のときのみ指定可能（superRefine で整合性検証）。
   */
  framingMode: z.enum(FRAMING_MODES).optional(),
  // Inspire 専用: 参照するスタイルテンプレ ID と override 組み合わせ。
  // generationType='inspire' のときのみ意味を持つ（superRefine で整合性検証）。
  styleTemplateId: z.string().uuid().optional(),
  overrides: z
    .object({
      outfit: z.boolean(),
      angle: z.boolean(),
      pose: z.boolean(),
      background: z.boolean(),
    })
    .optional(),
  // Creator Looks 専用: 生成モード(衣装のみ/衣装＋背景2段階/背景のみ)。
  // 指定時は handler 側で overrides より優先して override_* を導出する。
  creatorLooksMode: z.enum(CREATOR_LOOKS_MODES).optional(),
}).superRefine((data, ctx) => {
  const hasSourceImageStockId =
    typeof data.sourceImageStockId === "string" &&
    data.sourceImageStockId.length > 0;
  const hasSourceImageGeneratedId =
    typeof data.sourceImageGeneratedId === "string" &&
    data.sourceImageGeneratedId.length > 0;
  const hasSourceImageBase64 =
    typeof data.sourceImageBase64 === "string" &&
    data.sourceImageBase64.trim().length > 0;
  const hasSourceImageMimeType =
    typeof data.sourceImageMimeType === "string" &&
    data.sourceImageMimeType.trim().length > 0;

  // フロント仕様と合わせて、元画像 (アップロード or ストック or 生成済み再利用) を必須化
  if (
    !hasSourceImageStockId &&
    !hasSourceImageGeneratedId &&
    !(hasSourceImageBase64 && hasSourceImageMimeType)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceImageBase64"],
      message: "人物画像をアップロードまたはストック画像を選択してください",
    });
  }

  // stockId / generatedId / base64 は排他: 同時に複数指定された場合は曖昧。
  const sourceInputCount =
    (hasSourceImageStockId ? 1 : 0) +
    (hasSourceImageGeneratedId ? 1 : 0) +
    (hasSourceImageBase64 ? 1 : 0);
  if (sourceInputCount > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceImageGeneratedId"],
      message:
        "sourceImageStockId / sourceImageGeneratedId / sourceImageBase64 は同時に指定できません",
    });
  }

  // inspire 整合性検証: generationType='inspire' のときのみ styleTemplateId が必須、
  // それ以外のタイプでは styleTemplateId / overrides を受け付けない。
  if (data.generationType === 'inspire') {
    if (!data.styleTemplateId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["styleTemplateId"],
        message: "スタイルテンプレートを選択してください",
      });
    }
    if (data.overrides) {
      const anyChecked =
        data.overrides.outfit ||
        data.overrides.angle ||
        data.overrides.pose ||
        data.overrides.background;
      if (!anyChecked) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["overrides"],
          message: "変更したい要素を 1 つ以上選択してください",
        });
      }
    }
  } else {
    if (data.styleTemplateId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["styleTemplateId"],
        message: "styleTemplateId は inspire 生成時のみ指定できます",
      });
    }
    if (data.overrides) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["overrides"],
        message: "overrides は inspire 生成時のみ指定できます",
      });
    }
  }

  // framingMode は coordinate 生成時のみ指定可能
  // (one_tap_style は /style/generate-async 経路、inspire は angle/pose の専用 override を持つ)
  if (data.framingMode && data.generationType !== "coordinate") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["framingMode"],
      message: "framingMode は coordinate 生成時のみ指定できます",
    });
  }
}).transform((data) => {
  const backgroundMode = resolveBackgroundMode(
    data.backgroundMode,
    data.backgroundChange
  );

  return {
    ...data,
    backgroundMode,
    // サーバー内の後方互換用にboolean値も正規化して保持
    backgroundChange: backgroundModeToBackgroundChange(backgroundMode),
  };
});

export type GenerationRequestInput = z.infer<typeof generationRequestSchema>;

// getSafeExtensionFromMimeTypeをエクスポート（route.tsで使用）
export { getSafeExtensionFromMimeType };
