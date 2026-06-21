"use client";

import Link from "next/link";
import type { PresetCategoryAdmin } from "@/features/style-presets/lib/preset-category-repository";

interface Props {
  categories: PresetCategoryAdmin[];
}

export function AdminPresetCategoryListClient({ categories }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link
          href="/admin/preset-categories/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          新規カテゴリを作成
        </Link>
      </div>

      {categories.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          カテゴリがまだありません。「新規カテゴリを作成」から登録してください。
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
          {categories.map((category) => (
            <li key={category.id} className="p-4">
              <Link
                href={`/admin/preset-categories/${category.id}`}
                className="block group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold"
                        style={{
                          backgroundColor: category.badgeColor,
                          color: category.badgeTextColor,
                        }}
                      >
                        {category.displayNameJa}
                      </span>
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">
                        {category.key}
                      </code>
                      {!category.isActive && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                          inactive
                        </span>
                      )}
                      {category.skipBasePrefix && (
                        <span className="rounded bg-pink-100 px-1.5 py-0.5 text-xs font-medium text-pink-800">
                          raw モード
                        </span>
                      )}
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                        デフォルト入力: {category.defaultImageInputMode}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                        出力比率:{" "}
                        {category.outputAspectRatioMode === "source"
                          ? "アップロードに合わせる"
                          : category.outputAspectRatioMode}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          category.visibility === "public"
                            ? "bg-sky-100 text-sky-800"
                            : "bg-orange-100 text-orange-800"
                        }`}
                      >
                        公開範囲:{" "}
                        {category.visibility === "public"
                          ? "全ユーザー"
                          : "運営のみ"}
                      </span>
                      {(category.userGuidanceJa || category.userGuidanceEn) && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
                          説明あり
                        </span>
                      )}
                      {(!category.showSourceImageTypeControl ||
                        !category.showBackgroundChangeControl ||
                        !category.showGenerationModelControl) && (
                        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800">
                          UI 非表示設定あり
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {category.displayNameEn} · 表示順: {category.displayOrder}
                    </div>
                  </div>
                  <span
                    className="self-center text-sm text-slate-400 group-hover:text-slate-700"
                    aria-hidden
                  >
                    編集 →
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
