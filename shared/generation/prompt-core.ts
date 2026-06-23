/**
 * 画像生成の共通ロジック
 * Next.js API/Client と Supabase Edge Function の両方から利用する。
 *
 * 本ファイルは pure (ランタイム依存ゼロ) に保つ (ADR-007)。
 * DB override の解決は呼び出し側で resolver を経由させ、
 * `templates` 引数として渡す設計。
 */

import { PROMPT_REGISTRY } from "./prompt-registry.ts";
import { applyTemplate } from "./prompt-template.ts";
import { isUnlockedFramingMode } from "./framing-mode.ts";
import type { FramingMode } from "./framing-mode.ts";

/**
 * registry key の content を解決する。templates dict に override があれば優先、
 * 無ければ registry の defaultContent を返す (sync)。
 */
function resolveTemplate(
  templates: Record<string, string> | undefined,
  key: keyof typeof PROMPT_REGISTRY,
): string {
  return templates?.[key] ?? PROMPT_REGISTRY[key].defaultContent;
}

/**
 * 生成タイプ。
 *
 * 注: 過去には `specified_coordinate` / `full_body` / `chibi` も列挙していたが、
 * UI から選択肢が外れて 30 日以上利用ゼロのため registry / builder ロジックごと撤去した。
 * DB の CHECK 制約 (image_jobs / generated_images) には歴史的経緯で残っているが、
 * 新規 job では使われない。再導入する場合は registry + builder + UI の追加が必要。
 */
export type GenerationType =
  | "coordinate"
  | "one_tap_style"
  | "inspire";

/**
 * Inspire 機能で「テンプレのどの要素を image_0 に適用するか」の組み合わせ。
 *
 * - 4 つすべて true: 「すべて維持」と等価で、image_1 のシーンを丸ごと採用
 * - 個別に true: チェックされた属性だけを image_1 から image_0 に移植
 * - 4 つすべて false: API 側で 400 エラー（UI 側でも生成ボタン disabled）
 */
export interface InspireOverrides {
  outfit: boolean;
  angle: boolean;
  pose: boolean;
  background: boolean;
}

/** 4 つすべて true（=「すべて維持」）かどうかを判定するヘルパ。 */
export function isInspireKeepAll(overrides: InspireOverrides): boolean {
  return (
    overrides.outfit && overrides.angle && overrides.pose && overrides.background
  );
}

/** 少なくとも 1 つチェックされているかを判定するヘルパ（バリデーション用）。 */
export function hasAnyInspireOverride(overrides: InspireOverrides): boolean {
  return (
    overrides.outfit || overrides.angle || overrides.pose || overrides.background
  );
}

export const SOURCE_IMAGE_TYPES = ["illustration", "real"] as const;
export type SourceImageType = (typeof SOURCE_IMAGE_TYPES)[number];

export const BACKGROUND_MODES = [
  "ai_auto",
  "include_in_prompt",
  "keep",
] as const;
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];

/**
 * 旧仕様のbackgroundChange(boolean)を新仕様のbackgroundModeに変換
 */
export function backgroundChangeToBackgroundMode(
  backgroundChange?: boolean | null
): BackgroundMode {
  return backgroundChange ? "ai_auto" : "keep";
}

/**
 * 新仕様のbackgroundModeを旧仕様のbackgroundChange(boolean)に変換
 */
export function backgroundModeToBackgroundChange(
  backgroundMode: BackgroundMode
): boolean {
  return backgroundMode === "ai_auto";
}

/**
 * backgroundModeが未指定/不正値の場合はbackgroundChangeから推論
 */
export function resolveBackgroundMode(
  backgroundMode?: BackgroundMode | string | null,
  backgroundChange?: boolean | null
): BackgroundMode {
  if (
    backgroundMode === "ai_auto" ||
    backgroundMode === "include_in_prompt" ||
    backgroundMode === "keep"
  ) {
    return backgroundMode;
  }
  return backgroundChangeToBackgroundMode(backgroundChange);
}

export interface BuildPromptOptions {
  generationType: GenerationType;
  outfitDescription: string; // ユーザー入力（日本語のまま）
  backgroundMode: BackgroundMode;
  sourceImageType?: SourceImageType;
  /**
   * 解決済み prompt templates dict (Next.js resolver / worker resolver から渡す)。
   * 省略時は registry default を 100% 使う (= 既存挙動と等価、テスト容易)。
   */
  templates?: Record<string, string>;
  /**
   * "free_pose" のとき coordinate.base_prefix_free_pose を使い、背景 suffix も
   * free_pose 変種に差し替える。real/illustration の style suffix は付与しない
   * (画風維持の指示が free_pose 前文に内包されており、既存 suffix の
   * 「camera angle / composition 維持」がポーズ自由化と矛盾するため)。
   *
   * 省略 / "locked" は現行挙動と完全に等価。coordinate 以外の generationType では無視。
   */
  framingMode?: FramingMode;
  /**
   * ポーズ・カメラアングルの指定テキスト (admin viewer 限定先行公開)。
   * free_pose のとき、衣装指示("New Outfit")とは別の `Pose & Camera Direction:`
   * セクションとして結合する。これにより「アングル指定が衣装指示に混線して服が変わる」
   * のを防ぐ。locked / 空文字 / coordinate 以外では無視。
   */
  posePrompt?: string | null;
}

/**
 * プロンプトインジェクション対策: ユーザー入力をサニタイズ
 */
export function sanitizeUserInput(input: string): string {
  let sanitized = input.trim();

  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");
  sanitized = sanitized.replace(/\n{3,}/g, "\n\n");

  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|commands?)/i,
    /forget\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|commands?)/i,
    /override\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|commands?)/i,
    /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|commands?)/i,
    /system\s*:?\s*(prompt|instruction|command)/i,
    /<\|(system|user|assistant)\|>/i,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(sanitized)) {
      sanitized = sanitized.replace(pattern, "");
    }
  }

  return sanitized.trim();
}

/**
 * プロンプトを構築（プロンプトインジェクション対策済み）
 */
export function buildPrompt(options: BuildPromptOptions): string {
  const {
    generationType,
    outfitDescription,
    backgroundMode,
    sourceImageType = "illustration",
    templates,
    framingMode,
    posePrompt,
  } = options;
  const sanitizedDescription = sanitizeUserInput(outfitDescription);

  if (!sanitizedDescription || sanitizedDescription.length === 0) {
    throw new Error(
      "Invalid outfit description: empty or contains only prohibited content"
    );
  }

  if (generationType === "coordinate") {
    // free_pose の「フレーム固定解除」分岐。
    const unlocked = isUnlockedFramingMode(framingMode);

    // unlocked では real/illustration style suffix を付与しない (BuildPromptOptions コメント参照)
    const styleSuffix = unlocked
      ? null
      : sourceImageType === "real"
        ? resolveTemplate(templates, "coordinate.real_style_suffix")
        : resolveTemplate(templates, "coordinate.illustration_style_suffix");

    const sections: string[] = [
      resolveTemplate(
        templates,
        framingMode === "free_pose"
          ? "coordinate.base_prefix_free_pose"
          : "coordinate.base_prefix",
      ),
      ...(styleSuffix === null ? [] : [styleSuffix]),
    ];

    if (backgroundMode === "keep") {
      sections.push(
        resolveTemplate(
          templates,
          framingMode === "free_pose"
            ? "coordinate.keep_background_suffix_free_pose"
            : "coordinate.keep_background_suffix",
        ),
      );
    } else if (backgroundMode === "ai_auto") {
      sections.push(
        resolveTemplate(
          templates,
          framingMode === "free_pose"
            ? "coordinate.change_background_suffix_free_pose"
            : "coordinate.change_background_suffix",
        ),
      );
    }
    // include_in_prompt: ユーザー記述に背景指示を委ねるため、システム側の背景指示は追加しない

    sections.push(`New Outfit:\n\n${sanitizedDescription}`);

    // free_pose のときのみ、ポーズ・カメラ指定を衣装指示と別セクションで結合する。
    // 「New Outfit」に混ぜると角度指定が服の指示として解釈され服が変わるため分離する。
    if (unlocked) {
      const sanitizedPose = posePrompt ? sanitizeUserInput(posePrompt) : "";
      if (sanitizedPose.length > 0) {
        sections.push(`Pose & Camera Direction:\n\n${sanitizedPose}`);
      }
    }

    return sections.join("\n\n");
  }

  // specified_coordinate / full_body / chibi は UI から外れて 30 日以上利用ゼロのため
  // 撤去 (GenerationType union からも除外)。再導入する場合は git log から復元可能。

  if (generationType === "one_tap_style") {
    // One-tap style stores a fully assembled style-specific prompt in prompt_text.
    // If this generation type reaches the shared builder, return it as-is after
    // the normal sanitization pass instead of forcing one of the coordinate templates.
    return sanitizedDescription;
  }

  if (generationType === "inspire") {
    // Inspire のプロンプトは buildInspirePrompt() で別経路から組み立てる。
    // この経路に到達したら呼び出し側のバグなので明示的に失敗させる。
    throw new Error(
      "Inspire generation must use buildInspirePrompt() instead of buildPrompt()."
    );
  }

  throw new Error(
    `API Error - Configuration '${generationType}' not found. Available types: coordinate, one_tap_style, inspire`
  );
}

export interface BuildInspirePromptOptions {
  /**
   * 画像 1 (スタイルテンプレ) から image_0 (ユーザーキャラ) に適用する属性の組み合わせ。
   * 4 つすべて true は「すべて維持」と等価（image_1 のシーンに丸ごとキャラを置く）。
   */
  overrides: InspireOverrides;
  /**
   * 解決済み prompt templates dict (Next.js resolver / worker resolver から渡す)。
   * 省略時は registry default を 100% 使う。
   */
  templates?: Record<string, string>;
}

/**
 * outfit → angle → pose → background の順に、各 override が ON なら ON 文、
 * OFF なら OFF 文を返す（4 文必ず生成）。templates dict があれば override を優先。
 */
function getInspireActionSentences(
  overrides: InspireOverrides,
  templates: Record<string, string> | undefined,
): string[] {
  const order: ReadonlyArray<keyof InspireOverrides> = [
    "outfit",
    "angle",
    "pose",
    "background",
  ];
  return order.map((key) =>
    overrides[key]
      ? resolveTemplate(templates, `inspire.${key}_on` as keyof typeof PROMPT_REGISTRY)
      : resolveTemplate(
          templates,
          `inspire.${key}_off` as keyof typeof PROMPT_REGISTRY,
        ),
  );
}

/**
 * Inspire 生成用のプロンプトを構築する。
 *
 * 入力画像の順序は **必ず以下** とする（Worker / Next.js handler 側で揃えること）:
 *   image_0 = ユーザーがアップロードしたキャラ画像
 *   image_1 = 申請されたスタイルテンプレート画像
 *
 * 出力フレーム比率の起点画像は `resolveInspireTargetSizeBaseIndex(overrides)` で
 * 決まる（4 つすべて true だけ image_1 基準、他は image_0 基準）。両側を同じ overrides で
 * 揃えること。
 *
 * 構造:
 *   1. 前文（体型保持の絶対指示）
 *   2. チェックされた各 override のアクション文（日本語短文）
 *
 * 少なくとも 1 つ override がチェックされている前提（事前に hasAnyInspireOverride で検証する）。
 * チェックなしで呼ぶと action 文が 0 件になり、生成意図不明のプロンプトになる。
 */
export function buildInspirePrompt(options: BuildInspirePromptOptions): string {
  const { overrides, templates } = options;
  const preamble = resolveTemplate(templates, "inspire.preamble");
  const actions = getInspireActionSentences(overrides, templates);
  return [preamble, ...actions].join("\n\n");
}

/**
 * Inspire 生成で OpenAI helper に渡す `targetSizeBaseIndex` を解決する。
 *
 * - すべて維持（4 つ true）: image_1 のシーンに置き換える → image_1 のアスペクト比基準（→ 1）
 * - 部分上書き: image_0 を編集する → image_0 のアスペクト比基準（→ 0）
 *
 * caller（preview-generation handler / image-gen-worker）は `callOpenAIImageEditMultiInput*`
 * の `targetSizeBaseIndex` にこの値を渡すこと。プロンプト側のフレーミング指示と一致させる必要がある。
 */
export function resolveInspireTargetSizeBaseIndex(
  overrides: InspireOverrides,
): 0 | 1 {
  return isInspireKeepAll(overrides) ? 1 : 0;
}

/**
 * coordinate 生成タイプ向けのリトライ強化 prefix。
 * attempt=1 は空文字、attempt>=2 で「前回は衣装置換が反映されなかった」旨を Gemini に強く伝える。
 *
 * テンプレ内の `{{attempt}}` は呼び出し時に attempt 値で置換する。
 */
export function buildCoordinateAttemptReinforcementPrefix(
  attempt: number,
  templates?: Record<string, string>,
  framingMode?: FramingMode,
): string {
  if (attempt <= 1) {
    return "";
  }
  const template = resolveTemplate(
    templates,
    // モードごとに独立した key を使う (admin が個別にチューニングできるよう分離)
    framingMode === "free_pose"
      ? "reinforcement.coordinate_attempt_2plus_free_pose"
      : "reinforcement.coordinate_attempt_2plus",
  );
  return applyTemplate(template, { attempt });
}
