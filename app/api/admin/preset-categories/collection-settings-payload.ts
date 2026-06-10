import {
  isMountLayoutKey,
  slotCountForLayout,
  type MountLayoutKey,
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
  mountTemplatePath?: string | null;
  mountLayout?: MountLayoutKey | null;
  collectionCharacterPath?: string | null;
  collectionDisplayStartsAt?: string | null;
  collectionDisplayEndsAt?: string | null;
}

export interface CollectionSettingsExisting {
  isCollectionSeries: boolean;
  completionThreshold: number | null;
  mountTemplatePath: string | null;
  mountLayout: MountLayoutKey | null;
  /** 省略時は null(未設定)として扱う */
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
  };

  if (effective.isCollectionSeries) {
    if (
      effective.completionThreshold === null ||
      effective.completionThreshold <= 0 ||
      !effective.mountTemplatePath ||
      effective.mountLayout === null
    ) {
      return {
        ok: false,
        error:
          "コレクション有効時は コンプリート必要数(N) / 台紙テンプレ / レイアウト がすべて必要です",
      };
    }
    if (effective.completionThreshold !== slotCountForLayout(effective.mountLayout)) {
      return {
        ok: false,
        error: "コンプリート必要数(N)は選択した台紙レイアウトのスロット数と一致させてください",
      };
    }
  }

  return { ok: true, payload };
}
