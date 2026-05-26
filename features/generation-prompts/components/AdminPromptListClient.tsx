"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PromptCategory } from "@/shared/generation/prompt-registry";

interface RegisteredItem {
  promptKey: string;
  category: PromptCategory;
  description: string;
  hasOverride: boolean;
  updatedAt: string | null;
}

interface OrphanItem {
  promptKey: string;
  content: string;
  updatedAt: string;
}

interface Props {
  items: RegisteredItem[];
  orphans: OrphanItem[];
  categories: readonly PromptCategory[];
}

const CATEGORY_LABELS: Record<PromptCategory, string> = {
  style: "Style (One-Tap Style)",
  coordinate: "Coordinate (通常 / specified / full body / chibi)",
  inspire: "Inspire (テンプレ適用)",
  reinforcement: "Reinforcement (リトライ強化文)",
};

export function AdminPromptListClient({
  items,
  orphans,
  categories,
}: Props) {
  const grouped = useMemo(() => {
    const result = new Map<PromptCategory, RegisteredItem[]>();
    for (const c of categories) result.set(c, []);
    for (const item of items) {
      result.get(item.category)?.push(item);
    }
    return result;
  }, [items, categories]);

  const [orphanDeleteState, setOrphanDeleteState] = useState<
    Record<string, "idle" | "pending" | "done" | "error">
  >({});

  const handleDeleteOrphan = async (key: string) => {
    if (
      !confirm(
        `この未知の prompt_key "${key}" を DB から削除します。よろしいですか？\n` +
          "(コード側 registry に存在しないため、削除しても生成挙動に影響はありません)",
      )
    ) {
      return;
    }
    setOrphanDeleteState((s) => ({ ...s, [key]: "pending" }));
    try {
      const res = await fetch(
        `/api/admin/generation-prompts/${encodeURIComponent(key)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setOrphanDeleteState((s) => ({ ...s, [key]: "error" }));
        return;
      }
      setOrphanDeleteState((s) => ({ ...s, [key]: "done" }));
    } catch {
      setOrphanDeleteState((s) => ({ ...s, [key]: "error" }));
    }
  };

  return (
    <div className="space-y-8">
      {categories.map((category) => {
        const list = grouped.get(category) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={category}>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">
              {CATEGORY_LABELS[category]}{" "}
              <span className="text-sm font-normal text-slate-500">
                ({list.length})
              </span>
            </h2>
            <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
              {list.map((item) => (
                <li key={item.promptKey} className="p-4">
                  <Link
                    href={`/admin/generation-prompts/${encodeURIComponent(item.promptKey)}`}
                    className="block group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 group-hover:bg-slate-200">
                            {item.promptKey}
                          </code>
                          {item.hasOverride ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              編集済み
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                              default
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-700 group-hover:text-slate-900">
                          {item.description}
                        </p>
                        {item.updatedAt ? (
                          <p className="mt-1 text-xs text-slate-500">
                            {/* hydration mismatch を避けるため ISO 文字列を決定論的にスライス */}
                            最終更新: {item.updatedAt.slice(0, 10)} {item.updatedAt.slice(11, 16)} UTC
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-sm text-slate-400 group-hover:text-slate-600">
                        編集 →
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {orphans.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-amber-700">
            未知の prompt_key ({orphans.length}){" "}
            <span className="text-sm font-normal text-slate-500">
              registry に無いが DB に残っている row。削除推奨
            </span>
          </h2>
          <ul className="divide-y divide-amber-200 rounded-md border border-amber-300 bg-amber-50">
            {orphans.map((o) => {
              const state = orphanDeleteState[o.promptKey] ?? "idle";
              return (
                <li
                  key={o.promptKey}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-amber-900">
                      {o.promptKey}
                    </code>
                    <p className="mt-1 truncate text-xs text-slate-600">
                      {o.content.slice(0, 120)}
                      {o.content.length > 120 ? "…" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteOrphan(o.promptKey)}
                    disabled={state === "pending" || state === "done"}
                    className="shrink-0 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {state === "pending"
                      ? "削除中…"
                      : state === "done"
                        ? "削除済み"
                        : state === "error"
                          ? "失敗 (リトライ)"
                          : "削除"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
