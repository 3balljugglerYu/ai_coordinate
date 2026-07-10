import {
  isMountLayoutKey,
  parseNormalizedRect,
  parseNormalizedSlots,
  slotCountForLayout,
  type MountLayoutKey,
  type NormalizedSlotRect,
} from "@/features/collections/lib/mount-layouts";

/**
 * preset_categories のコレクション設定(is_collection_series / completion_threshold /
 * mount_template_path / mount_layout)を body から検証して取り出す共通ヘルパー。
 * POST(新規)と PATCH(更新)の両方で使う。
 *
 * R-02: コレクション有効時は N(正の整数)・台紙テンプレ・レイアウトがすべて必要。
 * DB の CHECK 制約でも担保しているが、ここで分かりやすいエラーを返す(多層防御)。
 */
export interface CollectionSettingsPayload {
  isCollectionSeries?: boolean;
  completionThreshold?: number | null;
  /** コレクション完走時に付与するペルコイン数。0/null=報酬なし。 */
  completionRewardPercoins?: number | null;
  /** 完走表示モード: 'mount'(単一台紙) / 'book'(めくれる日記帳)。 */
  completionViewMode?: "mount" | "book";
  /** book 表示の表紙(0ページ目)画像 storage path。 */
  bookCoverPath?: string | null;
  /** 完走必須の前提カテゴリ key(完走者限定の解放ゲート)。null=ゲートなし */
  unlockPrerequisiteKey?: string | null;
  /** プリセットを N 体ずつ段階解放する単位(正の整数)。null=最初から全部 */
  progressiveBatchSize?: number | null;
  /** 順番固定の1つずつ解放(sequential unlock)。true で先頭=表紙から昇順に順次解放。 */
  sequentialUnlock?: boolean;
  /** 解放お知らせ初回モーダルのヒーロー画像パス(public バケット)。null=固定画像にフォールバック */
  unlockAnnouncementHeroPath?: string | null;
  /** 解放お知らせ初回モーダルの本文。null=現行ハードコード文 */
  unlockAnnouncementInitialBody?: string | null;
  /** 解放お知らせ段階解放モーダルの本文。null=現行ハードコード文 */
  unlockAnnouncementDripBody?: string | null;
  /** 解放お知らせのボタン/アクセント色(#RRGGBB)。null=#C670FF */
  unlockAnnouncementAccentColor?: string | null;
  /** 解放お知らせのボタン hover 色(#RRGGBB)。null=#B14DF0 */
  unlockAnnouncementAccentHoverColor?: string | null;
  /** 解放お知らせの見出し文字色(#RRGGBB)。null=#8B3DC9 */
  unlockAnnouncementTitleColor?: string | null;
  /** 解放お知らせの NEW ピル/淡い面の背景色(#RRGGBB)。null=#F3E0FF */
  unlockAnnouncementSoftColor?: string | null;
  mountTemplatePath?: string | null;
  mountLayout?: MountLayoutKey | null;
  mountSlots?: NormalizedSlotRect[] | null;
  mountTemplateWidth?: number | null;
  mountTemplateHeight?: number | null;
  collectionCharacterPath?: string | null;
  collectionDisplayStartsAt?: string | null;
  collectionDisplayEndsAt?: string | null;
  progressModalFramePath?: string | null;
  progressModalFrameWidth?: number | null;
  progressModalFrameHeight?: number | null;
  progressModalSlots?: NormalizedSlotRect[] | null;
  progressModalButton?: NormalizedSlotRect | null;
  progressModalCenter?: NormalizedSlotRect | null;
  /** 進捗リングの色(#RRGGBB)または null(デフォルト配色) */
  progressModalRingColor?: string | null;
  /** %達成バッジの色(#RRGGBB)または null(デフォルト配色) */
  progressModalBadgeColor?: string | null;
  /** %達成バッジの文字色(#RRGGBB)または null(デフォルト配色) */
  progressModalBadgeTextColor?: string | null;
  /** %達成バッジの背景色(#RRGGBB)または null(デフォルト配色) */
  progressModalBadgeBgColor?: string | null;
  /** CTAボタンの塗り色(#RRGGBB)または null(デフォルト=オレンジ) */
  progressModalButtonColor?: string | null;
  /** CTAボタンの文字色(#RRGGBB)または null(デフォルト=白) */
  progressModalButtonTextColor?: string | null;
}

export interface CollectionSettingsExisting {
  isCollectionSeries: boolean;
  completionThreshold: number | null;
  completionViewMode?: "mount" | "book";
  mountTemplatePath: string | null;
  mountLayout: MountLayoutKey | null;
  /** 省略時は null(未設定)として扱う */
  mountSlots?: NormalizedSlotRect[] | null;
  collectionDisplayStartsAt?: string | null;
  collectionDisplayEndsAt?: string | null;
}

/** ISO 8601 等、Date が解釈できる日時文字列なら正規化した ISO を返す */
function parseTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

export type ParseCollectionSettingsResult =
  | { ok: true; payload: CollectionSettingsPayload }
  | { ok: false; error: string };

export function parseCollectionSettings(
  body: Record<string, unknown>,
  existing: CollectionSettingsExisting,
): ParseCollectionSettingsResult {
  const payload: CollectionSettingsPayload = {};

  if (body.is_collection_series !== undefined) {
    if (typeof body.is_collection_series !== "boolean") {
      return { ok: false, error: "is_collection_series must be boolean" };
    }
    payload.isCollectionSeries = body.is_collection_series;
  }

  if (body.completion_threshold !== undefined) {
    const v = body.completion_threshold;
    if (v === null) {
      payload.completionThreshold = null;
    } else if (
      typeof v !== "number" ||
      !Number.isInteger(v) ||
      v <= 0
    ) {
      return { ok: false, error: "completion_threshold must be a positive integer" };
    } else {
      payload.completionThreshold = v;
    }
  }

  // 完走報酬(ペルコイン)。0/null=報酬なし。負数・非整数は拒否(多層防御: DBのCHECKでも担保)。
  if (body.completion_reward_percoins !== undefined) {
    const v = body.completion_reward_percoins;
    if (v === null) {
      payload.completionRewardPercoins = null;
    } else if (
      typeof v !== "number" ||
      !Number.isInteger(v) ||
      v < 0
    ) {
      return {
        ok: false,
        error: "completion_reward_percoins must be a non-negative integer or null",
      };
    } else {
      payload.completionRewardPercoins = v;
    }
  }

  if (body.completion_view_mode !== undefined) {
    const v = body.completion_view_mode;
    if (v !== "mount" && v !== "book") {
      return { ok: false, error: "completion_view_mode must be 'mount' or 'book'" };
    }
    payload.completionViewMode = v;
  }

  if (body.book_cover_path !== undefined) {
    const v = body.book_cover_path;
    if (v === null) {
      payload.bookCoverPath = null;
    } else if (typeof v !== "string" || v.trim().length === 0) {
      return { ok: false, error: "book_cover_path must be a non-empty string or null" };
    } else {
      payload.bookCoverPath = v.trim();
    }
  }

  // 解放ゲート: 完走必須の前提カテゴリ key(完走者限定)。空文字は null(ゲートなし)に正規化。
  if (body.unlock_prerequisite_key !== undefined) {
    const v = body.unlock_prerequisite_key;
    if (v === null) {
      payload.unlockPrerequisiteKey = null;
    } else if (typeof v !== "string") {
      return {
        ok: false,
        error: "unlock_prerequisite_key must be a non-empty string or null",
      };
    } else {
      const trimmed = v.trim();
      payload.unlockPrerequisiteKey = trimmed.length > 0 ? trimmed : null;
    }
  }

  // 段階解放の単位 N(正の整数)。DB CHECK は > 0 または NULL。
  if (body.progressive_batch_size !== undefined) {
    const v = body.progressive_batch_size;
    if (v === null) {
      payload.progressiveBatchSize = null;
    } else if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
      return {
        ok: false,
        error: "progressive_batch_size must be an integer >= 1, or null",
      };
    } else {
      payload.progressiveBatchSize = v;
    }
  }

  // 順番固定の1つずつ解放(sequential unlock)。
  if (body.sequential_unlock !== undefined) {
    if (typeof body.sequential_unlock !== "boolean") {
      return { ok: false, error: "sequential_unlock must be boolean" };
    }
    payload.sequentialUnlock = body.sequential_unlock;
  }

  if (body.mount_template_path !== undefined) {
    const v = body.mount_template_path;
    if (v === null) {
      payload.mountTemplatePath = null;
    } else if (typeof v !== "string" || v.trim().length === 0) {
      return { ok: false, error: "mount_template_path must be a non-empty string or null" };
    } else {
      payload.mountTemplatePath = v.trim();
    }
  }

  if (body.mount_layout !== undefined) {
    const v = body.mount_layout;
    if (v === null) {
      payload.mountLayout = null;
    } else if (!isMountLayoutKey(v)) {
      return { ok: false, error: "mount_layout must be one of grid_3 / grid_4 / grid_6" };
    } else {
      payload.mountLayout = v;
    }
  }

  if (body.mount_slots !== undefined) {
    const v = body.mount_slots;
    if (v === null) {
      payload.mountSlots = null;
    } else {
      const parsed = parseNormalizedSlots(v);
      if (!parsed) {
        return {
          ok: false,
          error: "mount_slots は {x,y,w,h}(0..1) の配列で指定してください",
        };
      }
      // Phase 2 エディタは px 除算+丸めで正規化座標を作るため、x+w / y+h が
      // 浮動小数点誤差で 1 をごくわずかに超え得る。EPS で誤差を許容する。
      const SLOT_EPS = 1e-6;
      for (const r of parsed) {
        if (
          r.x < -SLOT_EPS ||
          r.y < -SLOT_EPS ||
          r.w <= 0 ||
          r.h <= 0 ||
          r.x + r.w > 1 + SLOT_EPS ||
          r.y + r.h > 1 + SLOT_EPS
        ) {
          return {
            ok: false,
            error: "mount_slots の各枠は 0..1 の範囲かつテンプレ内に収めてください",
          };
        }
      }
      payload.mountSlots = parsed;
    }
  }

  if (body.mount_template_width !== undefined) {
    const v = body.mount_template_width;
    if (v === null) {
      payload.mountTemplateWidth = null;
    } else if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
      return { ok: false, error: "mount_template_width must be a positive integer" };
    } else {
      payload.mountTemplateWidth = v;
    }
  }

  if (body.mount_template_height !== undefined) {
    const v = body.mount_template_height;
    if (v === null) {
      payload.mountTemplateHeight = null;
    } else if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
      return { ok: false, error: "mount_template_height must be a positive integer" };
    } else {
      payload.mountTemplateHeight = v;
    }
  }

  // ===== 進捗モーダル(CollectionProgressModal)のカスタム設定 =====
  // すべて任意・独立(is_collection_series との相互依存は持たせない)。
  // progress_modal_frame_path が設定されたカテゴリだけがモーダルを DB 駆動で描画し、
  // 未設定なら従来どおりハードコード MODAL_LAYOUTS にフォールバックする。
  const PROGRESS_SLOT_EPS = 1e-6;

  if (body.progress_modal_frame_path !== undefined) {
    const v = body.progress_modal_frame_path;
    if (v === null) {
      payload.progressModalFramePath = null;
    } else if (typeof v !== "string" || v.trim().length === 0) {
      return {
        ok: false,
        error: "progress_modal_frame_path must be a non-empty string or null",
      };
    } else {
      payload.progressModalFramePath = v.trim();
    }
  }

  if (body.progress_modal_frame_width !== undefined) {
    const v = body.progress_modal_frame_width;
    if (v === null) {
      payload.progressModalFrameWidth = null;
    } else if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
      return { ok: false, error: "progress_modal_frame_width must be a positive integer" };
    } else {
      payload.progressModalFrameWidth = v;
    }
  }

  if (body.progress_modal_frame_height !== undefined) {
    const v = body.progress_modal_frame_height;
    if (v === null) {
      payload.progressModalFrameHeight = null;
    } else if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
      return { ok: false, error: "progress_modal_frame_height must be a positive integer" };
    } else {
      payload.progressModalFrameHeight = v;
    }
  }

  if (body.progress_modal_slots !== undefined) {
    const v = body.progress_modal_slots;
    if (v === null) {
      payload.progressModalSlots = null;
    } else {
      const parsed = parseNormalizedSlots(v);
      if (!parsed) {
        return {
          ok: false,
          error: "progress_modal_slots は {x,y,w,h}(0..1) の配列で指定してください",
        };
      }
      for (const r of parsed) {
        if (
          r.x < -PROGRESS_SLOT_EPS ||
          r.y < -PROGRESS_SLOT_EPS ||
          r.w <= 0 ||
          r.h <= 0 ||
          r.x + r.w > 1 + PROGRESS_SLOT_EPS ||
          r.y + r.h > 1 + PROGRESS_SLOT_EPS
        ) {
          return {
            ok: false,
            error: "progress_modal_slots の各枠は 0..1 の範囲かつフレーム内に収めてください",
          };
        }
      }
      payload.progressModalSlots = parsed;
    }
  }

  if (body.progress_modal_button !== undefined) {
    const v = body.progress_modal_button;
    if (v === null) {
      payload.progressModalButton = null;
    } else {
      const rect = parseNormalizedRect(v);
      if (!rect) {
        return {
          ok: false,
          error: "progress_modal_button は {x,y,w,h}(0..1) のオブジェクトで指定してください",
        };
      }
      if (
        rect.x < -PROGRESS_SLOT_EPS ||
        rect.y < -PROGRESS_SLOT_EPS ||
        rect.w <= 0 ||
        rect.h <= 0 ||
        rect.x + rect.w > 1 + PROGRESS_SLOT_EPS ||
        rect.y + rect.h > 1 + PROGRESS_SLOT_EPS
      ) {
        return {
          ok: false,
          error: "progress_modal_button は 0..1 の範囲かつフレーム内に収めてください",
        };
      }
      payload.progressModalButton = rect;
    }
  }

  if (body.progress_modal_center !== undefined) {
    const v = body.progress_modal_center;
    if (v === null) {
      payload.progressModalCenter = null;
    } else {
      const rect = parseNormalizedRect(v);
      if (!rect) {
        return {
          ok: false,
          error: "progress_modal_center は {x,y,w,h}(0..1) のオブジェクトで指定してください",
        };
      }
      if (
        rect.x < -PROGRESS_SLOT_EPS ||
        rect.y < -PROGRESS_SLOT_EPS ||
        rect.w <= 0 ||
        rect.h <= 0 ||
        rect.x + rect.w > 1 + PROGRESS_SLOT_EPS ||
        rect.y + rect.h > 1 + PROGRESS_SLOT_EPS
      ) {
        return {
          ok: false,
          error: "progress_modal_center は 0..1 の範囲かつフレーム内に収めてください",
        };
      }
      payload.progressModalCenter = rect;
    }
  }

  // 進捗モーダルの配色(任意・独立)。NULL=従来デフォルト配色。
  // #RRGGBB の16進カラーのみ許可(DB の CHECK 制約と同等。多層防御)。
  const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

  if (body.progress_modal_ring_color !== undefined) {
    const v = body.progress_modal_ring_color;
    if (v === null) {
      payload.progressModalRingColor = null;
    } else if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
      return {
        ok: false,
        error: "progress_modal_ring_color must be a #RRGGBB hex color or null",
      };
    } else {
      payload.progressModalRingColor = v;
    }
  }

  if (body.progress_modal_badge_color !== undefined) {
    const v = body.progress_modal_badge_color;
    if (v === null) {
      payload.progressModalBadgeColor = null;
    } else if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
      return {
        ok: false,
        error: "progress_modal_badge_color must be a #RRGGBB hex color or null",
      };
    } else {
      payload.progressModalBadgeColor = v;
    }
  }

  if (body.progress_modal_badge_text_color !== undefined) {
    const v = body.progress_modal_badge_text_color;
    if (v === null) {
      payload.progressModalBadgeTextColor = null;
    } else if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
      return {
        ok: false,
        error: "progress_modal_badge_text_color must be a #RRGGBB hex color or null",
      };
    } else {
      payload.progressModalBadgeTextColor = v;
    }
  }

  if (body.progress_modal_badge_bg_color !== undefined) {
    const v = body.progress_modal_badge_bg_color;
    if (v === null) {
      payload.progressModalBadgeBgColor = null;
    } else if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
      return {
        ok: false,
        error: "progress_modal_badge_bg_color must be a #RRGGBB hex color or null",
      };
    } else {
      payload.progressModalBadgeBgColor = v;
    }
  }

  if (body.progress_modal_button_color !== undefined) {
    const v = body.progress_modal_button_color;
    if (v === null) {
      payload.progressModalButtonColor = null;
    } else if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
      return {
        ok: false,
        error: "progress_modal_button_color must be a #RRGGBB hex color or null",
      };
    } else {
      payload.progressModalButtonColor = v;
    }
  }

  if (body.progress_modal_button_text_color !== undefined) {
    const v = body.progress_modal_button_text_color;
    if (v === null) {
      payload.progressModalButtonTextColor = null;
    } else if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
      return {
        ok: false,
        error:
          "progress_modal_button_text_color must be a #RRGGBB hex color or null",
      };
    } else {
      payload.progressModalButtonTextColor = v;
    }
  }

  // ===== 解放お知らせモーダル(PetitUnlockAnnouncer)のカスタム設定 =====
  // すべて任意・独立。NULL なら現行ハードコード(画像/文言/紫基調の配色)にフォールバック。
  const UNLOCK_BODY_MAX_LENGTH = 200;

  if (body.unlock_announcement_hero_path !== undefined) {
    const v = body.unlock_announcement_hero_path;
    if (v === null) {
      payload.unlockAnnouncementHeroPath = null;
    } else if (typeof v !== "string" || v.trim().length === 0) {
      return {
        ok: false,
        error:
          "unlock_announcement_hero_path must be a non-empty string or null",
      };
    } else {
      payload.unlockAnnouncementHeroPath = v.trim();
    }
  }

  if (body.unlock_announcement_initial_body !== undefined) {
    const v = body.unlock_announcement_initial_body;
    if (v === null) {
      payload.unlockAnnouncementInitialBody = null;
    } else if (typeof v !== "string") {
      return {
        ok: false,
        error: "unlock_announcement_initial_body must be a string or null",
      };
    } else {
      const trimmed = v.trim();
      if (trimmed.length > UNLOCK_BODY_MAX_LENGTH) {
        return {
          ok: false,
          error: `unlock_announcement_initial_body must be <= ${UNLOCK_BODY_MAX_LENGTH} chars`,
        };
      }
      payload.unlockAnnouncementInitialBody =
        trimmed.length > 0 ? trimmed : null;
    }
  }

  if (body.unlock_announcement_drip_body !== undefined) {
    const v = body.unlock_announcement_drip_body;
    if (v === null) {
      payload.unlockAnnouncementDripBody = null;
    } else if (typeof v !== "string") {
      return {
        ok: false,
        error: "unlock_announcement_drip_body must be a string or null",
      };
    } else {
      const trimmed = v.trim();
      if (trimmed.length > UNLOCK_BODY_MAX_LENGTH) {
        return {
          ok: false,
          error: `unlock_announcement_drip_body must be <= ${UNLOCK_BODY_MAX_LENGTH} chars`,
        };
      }
      payload.unlockAnnouncementDripBody = trimmed.length > 0 ? trimmed : null;
    }
  }

  // 色 4 種: #RRGGBB or null。HEX_COLOR_RE(進捗モーダル配色と同一)で検証。
  if (body.unlock_announcement_accent_color !== undefined) {
    const v = body.unlock_announcement_accent_color;
    if (v === null) {
      payload.unlockAnnouncementAccentColor = null;
    } else if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
      return {
        ok: false,
        error: "unlock_announcement_accent_color must be a #RRGGBB hex color or null",
      };
    } else {
      payload.unlockAnnouncementAccentColor = v;
    }
  }

  if (body.unlock_announcement_accent_hover_color !== undefined) {
    const v = body.unlock_announcement_accent_hover_color;
    if (v === null) {
      payload.unlockAnnouncementAccentHoverColor = null;
    } else if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
      return {
        ok: false,
        error:
          "unlock_announcement_accent_hover_color must be a #RRGGBB hex color or null",
      };
    } else {
      payload.unlockAnnouncementAccentHoverColor = v;
    }
  }

  if (body.unlock_announcement_title_color !== undefined) {
    const v = body.unlock_announcement_title_color;
    if (v === null) {
      payload.unlockAnnouncementTitleColor = null;
    } else if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
      return {
        ok: false,
        error: "unlock_announcement_title_color must be a #RRGGBB hex color or null",
      };
    } else {
      payload.unlockAnnouncementTitleColor = v;
    }
  }

  if (body.unlock_announcement_soft_color !== undefined) {
    const v = body.unlock_announcement_soft_color;
    if (v === null) {
      payload.unlockAnnouncementSoftColor = null;
    } else if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
      return {
        ok: false,
        error: "unlock_announcement_soft_color must be a #RRGGBB hex color or null",
      };
    } else {
      payload.unlockAnnouncementSoftColor = v;
    }
  }

  // 任意: リング中央のキャラ画像パス(R-02 の必須対象ではない)
  if (body.collection_character_path !== undefined) {
    const v = body.collection_character_path;
    if (v === null) {
      payload.collectionCharacterPath = null;
    } else if (typeof v !== "string" || v.trim().length === 0) {
      return { ok: false, error: "collection_character_path must be a non-empty string or null" };
    } else {
      payload.collectionCharacterPath = v.trim();
    }
  }

  // 任意: 進捗カードの表示期間(NULL=制限なし)。コレクション無効時も保持できる
  if (body.collection_display_starts_at !== undefined) {
    const v = body.collection_display_starts_at;
    if (v === null) {
      payload.collectionDisplayStartsAt = null;
    } else {
      const parsed = parseTimestamp(v);
      if (!parsed) {
        return {
          ok: false,
          error: "collection_display_starts_at must be a valid datetime string or null",
        };
      }
      payload.collectionDisplayStartsAt = parsed;
    }
  }

  if (body.collection_display_ends_at !== undefined) {
    const v = body.collection_display_ends_at;
    if (v === null) {
      payload.collectionDisplayEndsAt = null;
    } else {
      const parsed = parseTimestamp(v);
      if (!parsed) {
        return {
          ok: false,
          error: "collection_display_ends_at must be a valid datetime string or null",
        };
      }
      payload.collectionDisplayEndsAt = parsed;
    }
  }

  // 反映後の実効値で開始 < 終了を検証(DB の CHECK と同等。多層防御)
  const effectiveStartsAt =
    payload.collectionDisplayStartsAt !== undefined
      ? payload.collectionDisplayStartsAt
      : (existing.collectionDisplayStartsAt ?? null);
  const effectiveEndsAt =
    payload.collectionDisplayEndsAt !== undefined
      ? payload.collectionDisplayEndsAt
      : (existing.collectionDisplayEndsAt ?? null);
  if (
    effectiveStartsAt !== null &&
    effectiveEndsAt !== null &&
    Date.parse(effectiveStartsAt) >= Date.parse(effectiveEndsAt)
  ) {
    return {
      ok: false,
      error: "表示期間は 開始日時 < 終了日時 となるように設定してください",
    };
  }

  // 反映後の実効値で R-02 を検証
  const effective: CollectionSettingsExisting = {
    isCollectionSeries:
      payload.isCollectionSeries ?? existing.isCollectionSeries,
    completionThreshold:
      payload.completionThreshold !== undefined
        ? payload.completionThreshold
        : existing.completionThreshold,
    mountTemplatePath:
      payload.mountTemplatePath !== undefined
        ? payload.mountTemplatePath
        : existing.mountTemplatePath,
    mountLayout:
      payload.mountLayout !== undefined
        ? payload.mountLayout
        : existing.mountLayout,
    mountSlots:
      payload.mountSlots !== undefined
        ? payload.mountSlots
        : (existing.mountSlots ?? null),
  };

  // 完走表示モード(実効値)。book は台紙テンプレ/レイアウトを使わないため R-02 を分岐する。
  const effectiveViewMode =
    payload.completionViewMode ?? existing.completionViewMode ?? "mount";

  if (effective.isCollectionSeries) {
    if (effectiveViewMode === "book") {
      // book: コンプリート必要数(N=ページ数)のみ必須。台紙テンプレ/レイアウト/枠は不要。
      if (
        effective.completionThreshold === null ||
        effective.completionThreshold <= 0
      ) {
        return {
          ok: false,
          error: "コレクション有効(book表示)時は コンプリート必要数(N) が必要です",
        };
      }
    } else {
      // mount(従来台紙): N / 台紙テンプレ / (レイアウト or カスタム枠) が必要。
      const hasSlots =
        Array.isArray(effective.mountSlots) && effective.mountSlots.length > 0;
      if (
        effective.completionThreshold === null ||
        effective.completionThreshold <= 0 ||
        !effective.mountTemplatePath ||
        (effective.mountLayout === null && !hasSlots)
      ) {
        return {
          ok: false,
          error:
            "コレクション有効時は コンプリート必要数(N) / 台紙テンプレ / (レイアウト または カスタム枠) が必要です",
        };
      }
      // mount_slots(カスタム枠)があればそのスロット数、無ければレイアウトのスロット数と一致させる
      const expectedSlotCount = hasSlots
        ? effective.mountSlots!.length
        : slotCountForLayout(effective.mountLayout!);
      if (effective.completionThreshold !== expectedSlotCount) {
        return {
          ok: false,
          error: "コンプリート必要数(N)は枠(スロット)数と一致させてください",
        };
      }
    }
  }

  return { ok: true, payload };
}
