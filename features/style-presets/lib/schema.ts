import { z } from "zod";
import type { StyleOutputAspectRatioMode } from "@/shared/generation/style-output-aspect-ratio";

export const STYLE_PRESET_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

export const STYLE_PRESET_MAX_FILE_SIZE = 5 * 1024 * 1024;

export const STYLE_PRESET_STATUS_VALUES = [
  "draft",
  "pending",
  "published",
  "rejected",
] as const;

export const stylePresetStatusSchema = z.enum(STYLE_PRESET_STATUS_VALUES);

export type StylePresetStatus = (typeof STYLE_PRESET_STATUS_VALUES)[number];

export const IMAGE_INPUT_MODE_VALUES = ["single", "dual"] as const;
export const imageInputModeSchema = z.enum(IMAGE_INPUT_MODE_VALUES);
export type ImageInputMode = (typeof IMAGE_INPUT_MODE_VALUES)[number];

export const DUAL_REFERENCE_SOURCE_VALUES = ["admin", "user_upload"] as const;
export const dualReferenceSourceSchema = z.enum(DUAL_REFERENCE_SOURCE_VALUES);
export type DualReferenceSource = (typeof DUAL_REFERENCE_SOURCE_VALUES)[number];

export const STYLE_PRESET_CATEGORY_VISIBILITY_VALUES = [
  "public",
  "admin_only",
] as const;
export const stylePresetCategoryVisibilitySchema = z.enum(
  STYLE_PRESET_CATEGORY_VISIBILITY_VALUES
);
export type StylePresetCategoryVisibility =
  (typeof STYLE_PRESET_CATEGORY_VISIBILITY_VALUES)[number];

export interface StylePresetCategoryRef {
  id: string;
  key: string;
  displayNameJa: string;
  displayNameEn: string;
  badgeColor: string;
  badgeTextColor: string;
  skipBasePrefix: boolean;
  outputAspectRatioMode: StyleOutputAspectRatioMode;
  userGuidanceJa: string | null;
  userGuidanceEn: string | null;
  showSourceImageTypeControl: boolean;
  showBackgroundChangeControl: boolean;
  showGenerationModelControl: boolean;
  showUserPromptInput: boolean;
  /** /style のプロンプト textarea ラベル(任意, null なら i18n デフォルト) */
  userPromptLabel: string | null;
  /** /style のプロンプト textarea placeholder(任意, null なら i18n デフォルト) */
  userPromptPlaceholder: string | null;
  /** /style のプロンプト textarea 最大文字数(任意, null なら既定 1500) */
  userPromptMaxLength: number | null;
  visibility: StylePresetCategoryVisibility;
  isActive: boolean;
  /**
   * 提供者(クリエイター)の profiles.id。コラボ/提供スタイルのクレジット表示に使う。
   * 未設定(従来カテゴリ)なら null/undefined。リポジトリ層では常に値を埋める optional 属性。
   */
  providerUserId?: string | null;
  /** 提供者の表示名(profiles.nickname をライブ取得)。provider 未設定なら null。 */
  providerNickname?: string | null;
  /** 提供者のアバター URL(profiles.avatar_url をライブ取得)。未設定なら null。 */
  providerAvatarUrl?: string | null;
  /**
   * 解放の前提条件となる別カテゴリの key。設定時、当該カテゴリを完走したユーザーにのみ
   * このカテゴリを解放する。null なら前提条件なし(従来どおり無条件公開)。
   */
  unlockPrerequisiteKey: string | null;
  /**
   * カテゴリ内プリセットを段階解放する単位(例: 2 なら 2 体ずつ)。null/0以下なら一括解放。
   * 判定式は features/collections/lib/collection-unlock.ts を参照。
   */
  progressiveBatchSize: number | null;
  /**
   * 順番固定の「1つずつ解放(sequential unlock)」。true のとき:
   *  - 前提カテゴリ(unlock_prerequisite_key)が無くても段階解放を適用する(単独で順次解放可)。
   *  - 解放方向を sort_order 昇順(先頭=表紙から前へ)にする(既存 drip は降順)。
   *  - batch 未設定時は 1(=1つずつ)として扱う。
   * 既存カテゴリは false で従来挙動を維持。
   */
  sequentialUnlock: boolean;
  /**
   * 解放お知らせモーダル(PetitUnlockAnnouncer)のカスタム設定。
   * いずれも null なら現行のハードコード(画像 /collections/petit-unlock-hero.png ・
   * 紫基調の文言/配色)にフォールバックする。features/collections/components/UnlockModals.tsx 参照。
   */
  unlockAnnouncementHeroPath: string | null;
  unlockAnnouncementInitialBody: string | null;
  unlockAnnouncementDripBody: string | null;
  unlockAnnouncementAccentColor: string | null;
  unlockAnnouncementAccentHoverColor: string | null;
  unlockAnnouncementTitleColor: string | null;
  unlockAnnouncementSoftColor: string | null;
}

export interface StylePresetAdmin {
  id: string;
  slug: string;
  title: string;
  stylingPrompt: string;
  backgroundPrompt: string | null;
  thumbnailImageUrl: string;
  thumbnailStoragePath: string | null;
  thumbnailWidth: number;
  thumbnailHeight: number;
  sortOrder: number;
  status: StylePresetStatus;
  category: StylePresetCategoryRef;
  imageInputMode: ImageInputMode;
  dualReferenceSource: DualReferenceSource;
  referenceImageUrl: string | null;
  referenceImageStoragePath: string | null;
  referenceImageWidth: number | null;
  referenceImageHeight: number | null;
  /** プリセット単位のクリエイター(提供者クレジット)= profiles.id。null ならクレジット無し。 */
  providerUserId?: string | null;
  providerNickname?: string | null;
  providerAvatarUrl?: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  // クリエイター提供プロンプト 申請(Phase 1)用。通常の admin 作成プリセットでは null。
  submittedByUserId: string | null;
  targetProviders: string[] | null;
  recommendedProvider: string | null;
  submissionConsents: Record<string, unknown> | null;
  previewOpenaiImageUrl: string | null;
  previewGeminiImageUrl: string | null;
}

export interface StylePresetPublicSummary {
  id: string;
  title: string;
  thumbnailImageUrl: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
  hasBackgroundPrompt: boolean;
  category: StylePresetCategoryRef;
  imageInputMode: ImageInputMode;
  dualReferenceSource: DualReferenceSource;
  /**
   * プリセット単位の提供者(style_presets.provider_user_id = profiles.id)。
   * 未設定ならカテゴリ単位(category.providerUserId)にフォールバックする。
   * character_remix のように 1 カテゴリに複数提供者が混在する場合に使う。
   */
  providerUserId?: string | null;
  /** 提供者の表示名(profiles.nickname をライブ取得)。 */
  providerNickname?: string | null;
  /** 提供者のアイコン(profiles.avatar_url をライブ取得)。 */
  providerAvatarUrl?: string | null;
  /**
   * 段階解放(drip)でまだ解放されていないプリセットのとき true。
   * /style では「コンプリートで解放」のシルエットカードとして表示し、選択・生成不可にする。
   * 未指定/false は通常の解放済みプリセット。
   */
  locked?: boolean;
}

export interface StylePresetGenerationRecord extends StylePresetPublicSummary {
  stylingPrompt: string;
  backgroundPrompt: string | null;
  status: StylePresetStatus;
  referenceImageUrl: string | null;
  referenceImageStoragePath: string | null;
}

export interface StylePresetInsert {
  id?: string;
  title: string;
  stylingPrompt: string;
  backgroundPrompt?: string | null;
  thumbnailImageUrl: string;
  thumbnailStoragePath?: string | null;
  thumbnailWidth: number;
  thumbnailHeight: number;
  sortOrder?: number;
  status: StylePresetStatus;
  createdBy?: string | null;
  // category / dual モード関連: 未指定の場合 RPC 側で 'coordinate' / 'single' / 'admin' に
  // フォールバックする (= 既存挙動を 100% 維持)。Phase 4 で admin UI 必須化する。
  categoryId?: string;
  imageInputMode?: ImageInputMode;
  dualReferenceSource?: DualReferenceSource;
  referenceImageUrl?: string | null;
  referenceImageStoragePath?: string | null;
  referenceImageWidth?: number | null;
  referenceImageHeight?: number | null;
  /** プリセット単位のクリエイター(提供者クレジット)= profiles.id。null でクレジット無し。 */
  providerUserId?: string | null;
}

export interface StylePresetUpdate {
  title?: string;
  stylingPrompt?: string;
  backgroundPrompt?: string | null;
  thumbnailImageUrl?: string;
  thumbnailStoragePath?: string | null;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  sortOrder?: number;
  status?: StylePresetStatus;
  updatedBy?: string | null;
  // 未指定なら現状値を維持する semantics。
  categoryId?: string;
  imageInputMode?: ImageInputMode;
  dualReferenceSource?: DualReferenceSource;
  referenceImageUrl?: string | null;
  referenceImageStoragePath?: string | null;
  referenceImageWidth?: number | null;
  referenceImageHeight?: number | null;
  /** プリセット単位のクリエイター(提供者クレジット)= profiles.id。null でクレジット解除。 */
  providerUserId?: string | null;
}

export const stylePresetReorderSchema = z.object({
  order: z.array(z.string().uuid()).min(1),
});

export interface ResolvedStylePresetProvider {
  /** プロフィールへのリンク用。nickname のみで userId 不明な場合は null(その場合リンクなし表示)。 */
  userId: string | null;
  nickname: string;
  avatarUrl: string | null;
}

/**
 * カード(ホーム/style一覧)・/style 選択画面に表示する「提供者クレジット」を解決する。
 * プリセット単位(style_presets.provider_user_id)を優先し、無ければ
 * カテゴリ単位(preset_categories.provider_user_id)へフォールバックする。
 * 表示に必要な nickname があるときだけ返す。userId はプロフィールリンク用(任意)。
 */
export function resolveStylePresetProvider(
  preset:
    | {
        providerUserId?: string | null;
        providerNickname?: string | null;
        providerAvatarUrl?: string | null;
        category?: {
          providerUserId?: string | null;
          providerNickname?: string | null;
          providerAvatarUrl?: string | null;
        } | null;
      }
    | null
    | undefined,
): ResolvedStylePresetProvider | null {
  if (!preset) {
    return null;
  }
  if (preset.providerNickname) {
    return {
      userId: preset.providerUserId ?? null,
      nickname: preset.providerNickname,
      avatarUrl: preset.providerAvatarUrl ?? null,
    };
  }
  const cat = preset.category;
  if (cat?.providerNickname) {
    return {
      userId: cat.providerUserId ?? null,
      nickname: cat.providerNickname,
      avatarUrl: cat.providerAvatarUrl ?? null,
    };
  }
  return null;
}

export function normalizeStylePresetTitle(title: string): string {
  return title.trim();
}

function normalizeStylePresetText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function normalizeStylePresetPrompt(prompt: string): string {
  return normalizeStylePresetText(prompt);
}

export function normalizeStylePresetOptionalPrompt(
  prompt: string | null | undefined
): string | null {
  if (typeof prompt !== "string") {
    return null;
  }

  const normalized = normalizeStylePresetText(prompt);
  return normalized.length > 0 ? normalized : null;
}

export function buildStylePresetSlug(title: string): string {
  const normalized = normalizeStylePresetTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized.length > 0 ? normalized : "style-preset";
}
