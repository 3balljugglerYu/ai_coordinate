import path from "node:path";
import { z } from "zod";
import {
  stylePresetStatusSchema,
  type StylePresetStatus,
} from "@/features/style-presets/lib/schema";

/**
 * 運営の標準(2026-09-28 に決定): 「研究中のプロンプト」に公開で入れる。
 *
 * 研究中のプロンプトは運営だけに見えるカテゴリ(visibility = admin_only)なので、
 * published を既定にしても一般の利用者には出ない。ただし公開範囲は管理画面で
 * 変えられるデータなので、登録するときにもカテゴリを見て確かめる(statusSpecified)。
 */
export const DEFAULT_CATEGORY_KEY = "admin_preview";
export const DEFAULT_STATUS: StylePresetStatus = "published";
export const DEFAULT_SORT_ORDER = 0;

const manifestEntrySchema = z
  .object({
    title: z.string(),
    image: z.string().min(1),
    stylingPromptFile: z.string().min(1),
    backgroundPromptFile: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    status: stylePresetStatusSchema.optional(),
    // 管理画面は小数を切り捨て、負の値を 0 に丸める(parse-style-preset-sort-order.ts)。
    // マニフェストは手で書くものなので、黙って丸めず書き間違いとして止める
    sortOrder: z.number().int().min(0).optional(),
  })
  // 項目名の打ち間違い(backgroundPromtFile など)を黙って捨てないため
  .strict();

export interface StylePresetManifestEntry {
  title: string;
  imagePath: string;
  stylingPromptPath: string;
  backgroundPromptPath: string | null;
  categoryKey: string;
  status: StylePresetStatus;
  /**
   * 公開状態をマニフェストに書いたか(既定で埋めたなら false)。
   * 既定の published が許されるのは運営だけに見えるカテゴリのときだけなので、
   * 登録時にカテゴリの公開範囲と突き合わせる。
   */
  statusSpecified: boolean;
  sortOrder: number;
}

export type ParseStylePresetManifestResult =
  | { ok: true; entries: StylePresetManifestEntry[] }
  | { ok: false; errors: string[] };

/**
 * マニフェスト(JSON の配列)を読み、省略した項目を運営の標準で埋める。
 * パスはマニフェストのある場所(baseDir)からの相対で解決する。
 */
export function parseStylePresetManifest(
  jsonText: string,
  baseDir: string
): ParseStylePresetManifestResult {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      errors: [`マニフェストが JSON として読めません: ${reason}`],
    };
  }

  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      ok: false,
      errors: ["マニフェストはプリセットの配列(1件以上)にしてください"],
    };
  }

  const entries: StylePresetManifestEntry[] = [];
  const errors: string[] = [];

  raw.forEach((item: unknown, index) => {
    const label = `${index + 1}件目`;
    const parsed = manifestEntrySchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const detail =
          issue.code === "unrecognized_keys"
            ? `知らない項目です: ${issue.keys.join(", ")}`
            : `${issue.path.join(".") || "行全体"}: ${issue.message}`;
        errors.push(`${label}: ${detail}`);
      }
      return;
    }

    const value = parsed.data;
    // ⭐ 既定の published は「運営だけに見える研究中のプロンプト」だから安全。
    //    カテゴリだけ変えると、一般公開のカテゴリへそのまま公開してしまう
    if (value.category !== undefined && value.status === undefined) {
      errors.push(
        `${label}: category を指定したときは status も指定してください(既定の published のまま一般公開のカテゴリへ入れないため)`
      );
      return;
    }

    entries.push({
      title: value.title,
      imagePath: path.resolve(baseDir, value.image),
      stylingPromptPath: path.resolve(baseDir, value.stylingPromptFile),
      backgroundPromptPath:
        value.backgroundPromptFile === undefined
          ? null
          : path.resolve(baseDir, value.backgroundPromptFile),
      categoryKey: value.category ?? DEFAULT_CATEGORY_KEY,
      status: value.status ?? DEFAULT_STATUS,
      statusSpecified: value.status !== undefined,
      sortOrder: value.sortOrder ?? DEFAULT_SORT_ORDER,
    });
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, entries };
}
