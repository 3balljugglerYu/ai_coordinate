"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { PresetCategoryAdmin } from "@/features/style-presets/lib/preset-category-repository";
import { DEFAULT_GENERATION_MODEL } from "@/features/generation/types";
import { getModelDisplayInfo } from "@/features/generation/lib/model-display";

type Mode = "create" | "edit";

/** 「生成モデル選択を表示」OFF 時にサーバー側で使われる既定モデルの表示名。 */
const DEFAULT_GENERATION_MODEL_LABEL =
  getModelDisplayInfo(DEFAULT_GENERATION_MODEL).displayName;

interface Props {
  mode: Mode;
  initial?: PresetCategoryAdmin;
  /**
   * initial の collectionDisplayStartsAt / EndsAt を datetime-local 形式 (JST)
   * に変換した文字列。サーバー Component で formatDatetimeLocalJst() 等を使い
   * 算出して渡す。`new Date()` を Client 側の useState 初期化で呼ぶと SSR/CSR
   * 間でタイムゾーン差により Hydration Mismatch が起きるため、サーバー側で
   * 決め打ち JST 変換しておく。
   */
  initialCollectionDisplayStartsAtLocal?: string;
  initialCollectionDisplayEndsAtLocal?: string;
}

interface FormState {
  key: string;
  displayNameJa: string;
  displayNameEn: string;
  badgeColor: string;
  badgeTextColor: string;
  skipBasePrefix: boolean;
  defaultImageInputMode: "single" | "dual";
  outputAspectRatioMode: "source" | "square";
  userGuidanceJa: string;
  userGuidanceEn: string;
  showSourceImageTypeControl: boolean;
  showBackgroundChangeControl: boolean;
  showGenerationModelControl: boolean;
  showUserPromptInput: boolean;
  userPromptLabel: string;
  userPromptPlaceholder: string;
  userPromptMaxLength: number | null;
  visibility: "public" | "admin_only";
  isCollectionSeries: boolean;
  completionThreshold: number | null;
  mountTemplatePath: string | null;
  mountLayout: "" | "grid_3" | "grid_4" | "grid_6";
  collectionCharacterPath: string | null;
  /** datetime-local 形式("YYYY-MM-DDTHH:mm")。空文字 = 未設定 */
  collectionDisplayStartsAt: string;
  collectionDisplayEndsAt: string;
  displayOrder: number;
  isActive: boolean;
}

/**
 * datetime-local 入力値(JST 局所時刻) → ISO 日時。空文字/不正は null。
 * ブラウザの `new Date("YYYY-MM-DDTHH:mm")` はブラウザのローカル TZ で
 * 解釈される。admin は JST 前提のため、JST→UTC 換算が一意に決まる。
 * (この関数は submit 時にのみクライアントで呼ばれるので Hydration の影響なし)
 */
function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toFormState(
  initial?: PresetCategoryAdmin,
  initialDates?: { startsAtLocal?: string; endsAtLocal?: string },
): FormState {
  return {
    key: initial?.key ?? "",
    displayNameJa: initial?.displayNameJa ?? "",
    displayNameEn: initial?.displayNameEn ?? "",
    badgeColor: initial?.badgeColor ?? "#1f2937",
    badgeTextColor: initial?.badgeTextColor ?? "#ffffff",
    skipBasePrefix: initial?.skipBasePrefix ?? false,
    defaultImageInputMode: initial?.defaultImageInputMode ?? "single",
    outputAspectRatioMode: initial?.outputAspectRatioMode ?? "source",
    userGuidanceJa: initial?.userGuidanceJa ?? "",
    userGuidanceEn: initial?.userGuidanceEn ?? "",
    showSourceImageTypeControl: initial?.showSourceImageTypeControl ?? true,
    showBackgroundChangeControl: initial?.showBackgroundChangeControl ?? true,
    showGenerationModelControl: initial?.showGenerationModelControl ?? true,
    showUserPromptInput: initial?.showUserPromptInput ?? false,
    userPromptLabel: initial?.userPromptLabel ?? "",
    userPromptPlaceholder: initial?.userPromptPlaceholder ?? "",
    userPromptMaxLength: initial?.userPromptMaxLength ?? null,
    visibility: initial?.visibility ?? "admin_only",
    isCollectionSeries: initial?.isCollectionSeries ?? false,
    completionThreshold: initial?.completionThreshold ?? null,
    mountTemplatePath: initial?.mountTemplatePath ?? null,
    mountLayout: initial?.mountLayout ?? "",
    collectionCharacterPath: initial?.collectionCharacterPath ?? null,
    // Hydration Mismatch を避けるため、サーバー側で JST 変換済みの文字列を
    // props 経由で受け取る (props が無いケース = create mode のため空文字)。
    collectionDisplayStartsAt: initialDates?.startsAtLocal ?? "",
    collectionDisplayEndsAt: initialDates?.endsAtLocal ?? "",
    displayOrder: initial?.displayOrder ?? 0,
    isActive: initial?.isActive ?? true,
  };
}

/** generated-images(public バケット)に保存されたキャラ画像の公開URL */
function characterPublicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-images/${path}`;
}

/** private バケットの台紙テンプレを admin API 経由で配信するURL */
function mountTemplatePreviewUrl(path: string): string {
  return `/api/admin/collection-mount-template?path=${encodeURIComponent(path)}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

export function AdminPresetCategoryFormClient({
  mode,
  initial,
  initialCollectionDisplayStartsAtLocal,
  initialCollectionDisplayEndsAtLocal,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() =>
    toFormState(initial, {
      startsAtLocal: initialCollectionDisplayStartsAtLocal,
      endsAtLocal: initialCollectionDisplayEndsAtLocal,
    }),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [uploadingCharacter, setUploadingCharacter] = useState(false);

  async function handleCharacterUpload(file: File) {
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(form.key.trim())) {
      setError("キャラ画像をアップロードする前に key を入力してください");
      return;
    }
    setUploadingCharacter(true);
    setError(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/admin/collection-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryKey: form.key.trim(), imageBase64 }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        path?: string;
        error?: string;
      };
      if (!res.ok || !payload.path) {
        setError(payload.error ?? "キャラ画像のアップロードに失敗しました");
        return;
      }
      update("collectionCharacterPath", payload.path);
    } catch (err) {
      console.error("[AdminPresetCategoryFormClient] character upload failed:", err);
      setError("キャラ画像のアップロードに失敗しました");
    } finally {
      setUploadingCharacter(false);
    }
  }

  async function handleTemplateUpload(file: File) {
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(form.key.trim())) {
      setError("台紙テンプレをアップロードする前に key を入力してください");
      return;
    }
    setUploadingTemplate(true);
    setError(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/admin/collection-mount-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryKey: form.key.trim(), imageBase64 }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        path?: string;
        error?: string;
      };
      if (!res.ok || !payload.path) {
        setError(payload.error ?? "台紙テンプレのアップロードに失敗しました");
        return;
      }
      update("mountTemplatePath", payload.path);
    } catch (err) {
      console.error("[AdminPresetCategoryFormClient] template upload failed:", err);
      setError("台紙テンプレのアップロードに失敗しました");
    } finally {
      setUploadingTemplate(false);
    }
  }

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const body =
        mode === "create"
          ? {
              key: form.key.trim(),
              display_name_ja: form.displayNameJa.trim(),
              display_name_en: form.displayNameEn.trim(),
              badge_color: form.badgeColor,
              badge_text_color: form.badgeTextColor,
              skip_base_prefix: form.skipBasePrefix,
              default_image_input_mode: form.defaultImageInputMode,
              output_aspect_ratio_mode: form.outputAspectRatioMode,
              user_guidance_ja: form.userGuidanceJa.trim() || null,
              user_guidance_en: form.userGuidanceEn.trim() || null,
              show_source_image_type_control: form.showSourceImageTypeControl,
              show_background_change_control: form.showBackgroundChangeControl,
              show_generation_model_control: form.showGenerationModelControl,
              show_user_prompt_input: form.showUserPromptInput,
              user_prompt_label: form.userPromptLabel.trim() || null,
              user_prompt_placeholder: form.userPromptPlaceholder.trim() || null,
              user_prompt_max_length: form.userPromptMaxLength,
              visibility: form.visibility,
              is_collection_series: form.isCollectionSeries,
              completion_threshold: form.completionThreshold,
              mount_template_path: form.mountTemplatePath,
              mount_layout: form.mountLayout === "" ? null : form.mountLayout,
              collection_character_path: form.collectionCharacterPath,
              collection_display_starts_at: datetimeLocalToIso(
                form.collectionDisplayStartsAt,
              ),
              collection_display_ends_at: datetimeLocalToIso(
                form.collectionDisplayEndsAt,
              ),
              display_order: form.displayOrder,
              is_active: form.isActive,
            }
          : {
              display_name_ja: form.displayNameJa.trim(),
              display_name_en: form.displayNameEn.trim(),
              badge_color: form.badgeColor,
              badge_text_color: form.badgeTextColor,
              skip_base_prefix: form.skipBasePrefix,
              default_image_input_mode: form.defaultImageInputMode,
              output_aspect_ratio_mode: form.outputAspectRatioMode,
              user_guidance_ja: form.userGuidanceJa.trim() || null,
              user_guidance_en: form.userGuidanceEn.trim() || null,
              show_source_image_type_control: form.showSourceImageTypeControl,
              show_background_change_control: form.showBackgroundChangeControl,
              show_generation_model_control: form.showGenerationModelControl,
              show_user_prompt_input: form.showUserPromptInput,
              user_prompt_label: form.userPromptLabel.trim() || null,
              user_prompt_placeholder: form.userPromptPlaceholder.trim() || null,
              user_prompt_max_length: form.userPromptMaxLength,
              visibility: form.visibility,
              is_collection_series: form.isCollectionSeries,
              completion_threshold: form.completionThreshold,
              mount_template_path: form.mountTemplatePath,
              mount_layout: form.mountLayout === "" ? null : form.mountLayout,
              collection_character_path: form.collectionCharacterPath,
              collection_display_starts_at: datetimeLocalToIso(
                form.collectionDisplayStartsAt,
              ),
              collection_display_ends_at: datetimeLocalToIso(
                form.collectionDisplayEndsAt,
              ),
              display_order: form.displayOrder,
              is_active: form.isActive,
            };

      const url =
        mode === "create"
          ? "/api/admin/preset-categories"
          : `/api/admin/preset-categories/${initial?.id}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(payload.error ?? `Request failed: ${res.status}`);
        return;
      }

      router.push("/admin/preset-categories");
      router.refresh();
    } catch (err) {
      console.error("[AdminPresetCategoryFormClient] submit failed:", err);
      setError("送信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    if (mode !== "edit" || !initial) return;
    if (!confirm(`カテゴリ "${initial.displayNameJa}" を inactive にしますか?\n` +
      "(物理削除ではなく、新規 preset 作成の選択肢から外れるだけです。既存 preset の表示・生成には影響しません。)"))
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/preset-categories/${initial.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(payload.error ?? `Request failed: ${res.status}`);
        return;
      }
      router.push("/admin/preset-categories");
      router.refresh();
    } catch (err) {
      console.error("[AdminPresetCategoryFormClient] deactivate failed:", err);
      setError("送信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-md border border-slate-200 bg-white p-6"
    >
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            key (不変)
          </span>
          <input
            type="text"
            value={form.key}
            onChange={(e) => update("key", e.target.value)}
            readOnly={mode === "edit"}
            disabled={mode === "edit"}
            pattern="^[a-z][a-z0-9_]{1,49}$"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm disabled:bg-slate-100"
            placeholder="chibi"
          />
          <span className="mt-1 block text-xs text-slate-500">
            小文字英数字 + `_`、先頭は英字。2-50 文字。
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            表示順 (昇順)
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={form.displayOrder}
            onChange={(e) =>
              update("displayOrder", Number(e.target.value) || 0)
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            表示名 (日本語)
          </span>
          <input
            type="text"
            value={form.displayNameJa}
            onChange={(e) => update("displayNameJa", e.target.value)}
            required
            maxLength={60}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="ちびキャラ"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            表示名 (English)
          </span>
          <input
            type="text"
            value={form.displayNameEn}
            onChange={(e) => update("displayNameEn", e.target.value)}
            required
            maxLength={60}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Chibi"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            バッジ背景色
          </span>
          <input
            type="color"
            value={form.badgeColor}
            onChange={(e) => update("badgeColor", e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-slate-300"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            バッジ文字色
          </span>
          <input
            type="color"
            value={form.badgeTextColor}
            onChange={(e) => update("badgeTextColor", e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-slate-300"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            デフォルト画像入力モード
          </span>
          <select
            value={form.defaultImageInputMode}
            onChange={(e) =>
              update(
                "defaultImageInputMode",
                e.target.value as "single" | "dual",
              )
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="single">single (image_0 のみ)</option>
            <option value="dual">dual (image_0 + 参考画像)</option>
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            preset 新規作成時の初期値。preset ごとに上書き可能。
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            出力比率
          </span>
          <select
            value={form.outputAspectRatioMode}
            onChange={(e) =>
              update(
                "outputAspectRatioMode",
                e.target.value as "source" | "square",
              )
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="source">アップロード画像に合わせる</option>
            <option value="square">正方形固定 (1:1)</option>
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            正方形固定にすると、このカテゴリの preset 生成は Gemini / OpenAI ともに 1:1 で出力します。
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            公開範囲
          </span>
          <select
            value={form.visibility}
            onChange={(e) =>
              update(
                "visibility",
                e.target.value as "public" | "admin_only",
              )
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="admin_only">運営のみ</option>
            <option value="public">全ユーザーに公開</option>
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            運営のみの場合、ADMIN_USER_IDS のユーザーだけ /style に表示・生成できます。
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            ユーザー向け説明 (日本語)
          </span>
          <textarea
            value={form.userGuidanceJa}
            onChange={(e) => update("userGuidanceJa", e.target.value)}
            maxLength={1000}
            rows={5}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="例: 正面向き・全身が写っているイラストがおすすめです。"
          />
          <span className="mt-1 block text-xs text-slate-500">
            ユーザーに推奨画像や注意事項を伝えるための説明文です。表示場所は別 UI で利用できます。
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            ユーザー向け説明 (English)
          </span>
          <textarea
            value={form.userGuidanceEn}
            onChange={(e) => update("userGuidanceEn", e.target.value)}
            maxLength={1000}
            rows={5}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Example: Front-facing full-body illustrations work best."
          />
        </label>
      </div>

      <div className="rounded-md bg-slate-50 p-4">
        <p className="mb-2 text-sm font-medium text-slate-700">プレビュー</p>
        <span
          className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold"
          style={{
            backgroundColor: form.badgeColor,
            color: form.badgeTextColor,
          }}
        >
          {form.displayNameJa || "(表示名)"}
        </span>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-700">挙動フラグ</legend>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.skipBasePrefix}
            onChange={(e) => update("skipBasePrefix", e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">raw モード (skip_base_prefix)</span>
            <br />
            <span className="text-xs text-slate-500">
              true にすると生成時に共通プロンプト (style.base_prefix) を一切付与せず、
              admin が登録した文言だけを送ります。ちびキャラ・デフォルメ・イラスト化など、
              フォルム自体を変える生成に使います。
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => update("isActive", e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">active</span>
            <br />
            <span className="text-xs text-slate-500">
              false にすると新規 preset 作成の選択肢から外れます。
              既存 preset の表示・生成可否は preset 側の status で制御するため、
              inactive にしても過去の preset 表示・集計は維持されます。
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-700">
          ユーザー画面の表示項目
        </legend>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.showSourceImageTypeControl}
            onChange={(e) =>
              update("showSourceImageTypeControl", e.target.checked)
            }
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">アップロード画像のタイプを表示</span>
            <br />
            <span className="text-xs text-slate-500">
              OFF の場合、/style では「イラスト / 写真」を選ばせず、生成時は illustration として扱います。
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.showBackgroundChangeControl}
            onChange={(e) =>
              update("showBackgroundChangeControl", e.target.checked)
            }
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">背景設定を表示</span>
            <br />
            <span className="text-xs text-slate-500">
              OFF の場合、/style では背景変更チェックを表示せず、生成時は背景変更なしとして扱います。
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.showGenerationModelControl}
            onChange={(e) =>
              update("showGenerationModelControl", e.target.checked)
            }
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">生成モデル選択を表示</span>
            <br />
            <span className="text-xs text-slate-500">
              OFF の場合、/style ではモデル選択を表示せず、既定モデル（{DEFAULT_GENERATION_MODEL_LABEL}）で生成します。
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.showUserPromptInput}
            onChange={(e) =>
              update("showUserPromptInput", e.target.checked)
            }
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">ユーザープロンプト入力欄を表示</span>
            <br />
            <span className="text-xs text-slate-500">
              ON にすると /style にプロンプト textarea が出現し、preset.stylingPrompt の後ろにユーザー入力を結合して生成します。OFF (default) なら入力欄は出ず、preset.stylingPrompt のみで生成。
            </span>
          </span>
        </label>

        {form.showUserPromptInput ? (
          <div className="ml-7 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">
              未入力の場合、ユーザー画面では i18n のデフォルト文言「追加スタイルの指示(任意)」「例: 長袖のコートも追加して」が表示されます。
            </p>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                ラベル(textarea の見出し)
              </span>
              <textarea
                value={form.userPromptLabel}
                onChange={(e) => update("userPromptLabel", e.target.value)}
                maxLength={120}
                rows={2}
                placeholder={"例: 名前を記載してください(任意)\n【神の名前＋名前】になります"}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-slate-500">
                最大 120 文字。改行を入れるとユーザー画面でもそのまま改行表示されます(本文と説明文を分けたいときに利用)。
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                プレースホルダ(textarea 内のヒント)
              </span>
              <textarea
                value={form.userPromptPlaceholder}
                onChange={(e) =>
                  update("userPromptPlaceholder", e.target.value)
                }
                maxLength={200}
                rows={2}
                placeholder="例: ウエハースシールに描いて欲しい一言を入力(例: ハイビスカスの花を持たせて)"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-slate-500">
                最大 200 文字
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                入力できる最大文字数（任意）
              </span>
              <input
                type="number"
                min={1}
                max={1500}
                step={1}
                value={form.userPromptMaxLength ?? ""}
                onChange={(e) =>
                  update(
                    "userPromptMaxLength",
                    e.target.value === ""
                      ? null
                      : Math.floor(Number(e.target.value)),
                  )
                }
                placeholder="例: 10"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-slate-500">
                1〜1500。未設定なら既定の 1500 文字。名前入力用途なら 10
                文字などに絞れます。
              </span>
            </label>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-4 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-800">
          コレクション設定（集めてコンプリート）
        </legend>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.isCollectionSeries}
            onChange={(e) => update("isCollectionSeries", e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">このカテゴリをコレクションシリーズにする</span>
            <br />
            <span className="text-xs text-slate-500">
              ON にすると、ユニーク衣装を N 種そろえるとコンプリート判定・台紙生成が走ります。ON 時は下記 N / レイアウト / 台紙テンプレが必須です。
            </span>
          </span>
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              コンプリート必要数 N
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={form.completionThreshold ?? ""}
              onChange={(e) =>
                update(
                  "completionThreshold",
                  e.target.value === "" ? null : Math.floor(Number(e.target.value)),
                )
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="4"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              台紙レイアウト
            </span>
            <select
              value={form.mountLayout}
              onChange={(e) =>
                update(
                  "mountLayout",
                  e.target.value as FormState["mountLayout"],
                )
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">（未選択）</option>
              <option value="grid_3">grid_3（3枠）</option>
              <option value="grid_4">grid_4（4枠・2×2）</option>
              <option value="grid_6">grid_6（6枠・2×3）</option>
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              スロット数（=枠数）は N と一致させてください。
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              進捗カードの表示開始日時（任意）
            </span>
            <input
              type="datetime-local"
              value={form.collectionDisplayStartsAt}
              onChange={(e) =>
                update("collectionDisplayStartsAt", e.target.value)
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">
              未設定なら即時表示。
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              進捗カードの表示終了日時（任意）
            </span>
            <input
              type="datetime-local"
              value={form.collectionDisplayEndsAt}
              onChange={(e) =>
                update("collectionDisplayEndsAt", e.target.value)
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">
              終了後はマイページの進捗カード・進捗モーダルが非表示になります（admin
              にも適用）。完了サムネ・シェア・達成済みユーザーの台紙更新、/style
              での生成は終了後も可能です。
            </span>
          </label>
        </div>

        <div className="block">
          <span className="text-sm font-medium text-slate-700">
            台紙テンプレ（キャラを抜いた空PNG）
          </span>
          <input
            type="file"
            accept="image/png"
            disabled={uploadingTemplate}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleTemplateUpload(file);
              e.target.value = "";
            }}
            className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-sm"
          />
          <span className="mt-1 block text-xs text-slate-500">
            {uploadingTemplate
              ? "アップロード中…"
              : form.mountTemplatePath
                ? `登録済み: ${form.mountTemplatePath}`
                : "PNG・256〜4096px。アップロードすると保存パスが設定されます。"}
          </span>
          {form.mountTemplatePath && !uploadingTemplate ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={mountTemplatePreviewUrl(form.mountTemplatePath)}
              alt="登録済みの台紙テンプレのプレビュー"
              className="mt-2 max-h-56 w-auto rounded-md border border-slate-200 bg-slate-50"
            />
          ) : null}
        </div>

        <div className="block">
          <span className="text-sm font-medium text-slate-700">
            進捗リング中央キャラ画像（名前なし・任意）
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploadingCharacter}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleCharacterUpload(file);
              e.target.value = "";
            }}
            className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-sm"
          />
          <span className="mt-1 block text-xs text-slate-500">
            {uploadingCharacter
              ? "アップロード中…"
              : form.collectionCharacterPath
                ? `登録済み: ${form.collectionCharacterPath}`
                : "PNG/JPEG/WebP。進捗リング中央に表示するキャラ画像。未設定なら「N/M種」のテキスト表示。"}
          </span>
          {form.collectionCharacterPath && !uploadingCharacter ? (
            /* 実際の表示と同じ円形トリミングでプレビューする */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={characterPublicUrl(form.collectionCharacterPath)}
              alt="登録済みの進捗リング中央キャラ画像のプレビュー"
              className="mt-2 h-24 w-24 rounded-full border border-slate-200 object-cover"
            />
          ) : null}
        </div>
      </fieldset>

      <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4">
        {mode === "edit" && initial?.isActive && (
          <button
            type="button"
            onClick={handleDeactivate}
            disabled={busy}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            inactive にする
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push("/admin/preset-categories")}
          disabled={busy}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {mode === "create" ? "作成する" : "更新する"}
        </button>
      </div>
    </form>
  );
}
