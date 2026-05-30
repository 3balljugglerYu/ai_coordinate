"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { PresetCategoryAdmin } from "@/features/style-presets/lib/preset-category-repository";

type Mode = "create" | "edit";

interface Props {
  mode: Mode;
  initial?: PresetCategoryAdmin;
}

interface FormState {
  key: string;
  displayNameJa: string;
  displayNameEn: string;
  badgeColor: string;
  badgeTextColor: string;
  skipBasePrefix: boolean;
  defaultImageInputMode: "single" | "dual";
  displayOrder: number;
  isActive: boolean;
}

function toFormState(initial?: PresetCategoryAdmin): FormState {
  return {
    key: initial?.key ?? "",
    displayNameJa: initial?.displayNameJa ?? "",
    displayNameEn: initial?.displayNameEn ?? "",
    badgeColor: initial?.badgeColor ?? "#1f2937",
    badgeTextColor: initial?.badgeTextColor ?? "#ffffff",
    skipBasePrefix: initial?.skipBasePrefix ?? false,
    defaultImageInputMode: initial?.defaultImageInputMode ?? "single",
    displayOrder: initial?.displayOrder ?? 0,
    isActive: initial?.isActive ?? true,
  };
}

export function AdminPresetCategoryFormClient({ mode, initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
