"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyTemplate } from "@/shared/generation/prompt-template";
import { extractTemplateVariables } from "@/shared/generation/prompt-template";

const MAX_CONTENT_LENGTH = 4000;
const SIGNIFICANT_CHANGE_RATIO = 0.3; // ±30% で大幅変更とみなす

interface Props {
  promptKey: string;
  /** code default (常に固定 / 表示用) */
  defaultContent: string;
  /** 現在の DB override。null なら未編集 (default が適用中) */
  currentContent: string | null;
  /** registry が許可する変数 (admin に提示) */
  supportedVariables: string[];
  /** プレビュー時の初期値 (variable → サンプル値) */
  previewSamples: Readonly<Record<string, string>> | null;
  updatedAt: string | null;
}

export function AdminPromptEditClient({
  promptKey,
  defaultContent,
  currentContent,
  supportedVariables,
  previewSamples,
  updatedAt,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState<string>(
    currentContent ?? defaultContent,
  );
  const [previewVars, setPreviewVars] = useState<Record<string, string>>(
    () => ({ ...(previewSamples ?? {}) }),
  );
  const [toast, setToast] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [showDefault, setShowDefault] = useState(false);

  const contentLength = content.length;
  const lengthOk = contentLength > 0 && contentLength <= MAX_CONTENT_LENGTH;
  const overLimit = contentLength > MAX_CONTENT_LENGTH;

  // テンプレ内の {{varname}} を抽出して supportedVariables と diff
  const usedVars = useMemo(() => extractTemplateVariables(content), [content]);
  const unknownVars = useMemo(
    () => usedVars.filter((v) => !supportedVariables.includes(v)),
    [usedVars, supportedVariables],
  );

  // default 比 ±30% を超える変更は注意喚起
  const significantChange = useMemo(() => {
    const diff = Math.abs(content.length - defaultContent.length);
    return defaultContent.length > 0
      ? diff / defaultContent.length > SIGNIFICANT_CHANGE_RATIO
      : false;
  }, [content, defaultContent]);

  const previewText = useMemo(
    () => applyTemplate(content, previewVars),
    [content, previewVars],
  );

  const handleSave = () => {
    if (!lengthOk) {
      setToast({ kind: "error", text: "content の長さが範囲外です" });
      return;
    }
    setToast(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/generation-prompts/${encodeURIComponent(promptKey)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          },
        );
        const data = (await res.json()) as {
          ok?: boolean;
          warnings?: string[];
          error?: string;
        };
        if (!res.ok || !data.ok) {
          setToast({
            kind: "error",
            text: data.error ?? "保存に失敗しました",
          });
          return;
        }
        const warn = data.warnings && data.warnings.length > 0
          ? `（注意: ${data.warnings.join(" / ")}）`
          : "";
        setToast({ kind: "success", text: `保存しました${warn}` });
        router.refresh();
      } catch (err) {
        setToast({
          kind: "error",
          text: err instanceof Error ? err.message : String(err),
        });
      }
    });
  };

  const handleReset = () => {
    if (
      !confirm(
        "現在の override を削除し、コード default に戻します。よろしいですか？",
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/generation-prompts/${encodeURIComponent(promptKey)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setToast({
            kind: "error",
            text: data.error ?? "リセットに失敗しました",
          });
          return;
        }
        setContent(defaultContent);
        setToast({ kind: "success", text: "default に戻しました" });
        router.refresh();
      } catch (err) {
        setToast({
          kind: "error",
          text: err instanceof Error ? err.message : String(err),
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* status */}
      {toast ? (
        <div
          role="status"
          className={`rounded-md border px-4 py-2 text-sm ${
            toast.kind === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {toast.text}
        </div>
      ) : null}

      {/* main edit grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左: 編集 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label
              htmlFor="prompt-content"
              className="text-sm font-medium text-slate-900"
            >
              プロンプト内容
            </label>
            <span
              className={`text-xs ${
                overLimit ? "text-red-600 font-medium" : "text-slate-500"
              }`}
            >
              {contentLength.toLocaleString()} / {MAX_CONTENT_LENGTH.toLocaleString()} 文字
            </span>
          </div>
          <textarea
            id="prompt-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={20}
            className={`w-full rounded-md border bg-white px-3 py-2 font-mono text-sm shadow-sm focus:outline-none focus:ring-2 ${
              overLimit
                ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                : "border-slate-300 focus:border-slate-500 focus:ring-slate-200"
            }`}
          />
          {overLimit ? (
            <p className="text-xs text-red-600">
              {MAX_CONTENT_LENGTH} 文字以内に収めてください。
            </p>
          ) : null}
          {significantChange ? (
            <p className="text-xs text-amber-700">
              ⚠ default から大きく変更されています ({Math.abs(content.length - defaultContent.length)} 文字差)。意図した変更か確認してください。
            </p>
          ) : null}
          {unknownVars.length > 0 ? (
            <p className="text-xs text-amber-700">
              ⚠ 未サポートの変数が含まれています: {unknownVars.map((v) => `{{${v}}}`).join(", ")}
              <br />
              (生成時はそのまま残ります — タイポなら修正してください)
            </p>
          ) : null}

          {/* 操作 */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !lengthOk}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "処理中…" : "保存"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={isPending || currentContent === null}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={
                currentContent === null
                  ? "override が無いためリセット不要 (既に default 状態)"
                  : ""
              }
            >
              default に戻す
            </button>
            {updatedAt ? (
              <span className="text-xs text-slate-500">
                {/* hydration mismatch を避けるため ISO 文字列を決定論的にスライス */}
                最終更新: {updatedAt.slice(0, 10)} {updatedAt.slice(11, 16)} UTC
              </span>
            ) : null}
          </div>
        </div>

        {/* 右: プレビュー */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-900">
              プレビュー (変数置換後)
            </label>
          </div>
          {supportedVariables.length > 0 ? (
            <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-600">
                使える変数の仮値 (admin プレビュー用、生成には影響しません):
              </p>
              {supportedVariables.map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-slate-700">
                    {`{{${v}}}`}
                  </code>
                  <input
                    type="text"
                    value={previewVars[v] ?? ""}
                    onChange={(e) =>
                      setPreviewVars((prev) => ({
                        ...prev,
                        [v]: e.target.value,
                      }))
                    }
                    className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              このプロンプトには変数はありません。
            </p>
          )}
          <div className="rounded-md border border-slate-300 bg-white">
            <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-xs text-slate-800">
              {previewText}
            </pre>
          </div>
        </div>
      </div>

      {/* default 並表示 (折り畳み) */}
      <details
        open={showDefault}
        onToggle={(e) => setShowDefault((e.target as HTMLDetailsElement).open)}
        className="rounded-md border border-slate-200 bg-white"
      >
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          コード default を表示 ({defaultContent.length.toLocaleString()} 文字)
        </summary>
        <pre className="max-h-[400px] overflow-auto border-t border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 whitespace-pre-wrap">
          {defaultContent}
        </pre>
      </details>
    </div>
  );
}
