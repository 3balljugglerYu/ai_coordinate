"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import type { StylePresetAdmin } from "@/features/style-presets/lib/schema";

/**
 * クリエイター提供プロンプトの申請レビュー(admin)。
 * pending かつ submitted_by_user_id ありの style_preset を、提供プロンプト + 自動生成プレビュー
 * (OpenAI/Gemini)とともに表示し、承認 / 却下する。
 */
export function CreatorPromptReviewPanel({
  pendingPresets,
}: {
  pendingPresets: StylePresetAdmin[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (pendingPresets.length === 0) {
    return null;
  }

  const decide = async (id: string, action: "approve" | "reject") => {
    if (action === "reject" && !window.confirm("この申請を却下しますか?")) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/style-presets/submissions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "処理に失敗しました");
        setBusyId(null);
        return;
      }
      router.refresh();
    } catch {
      setError("通信に失敗しました");
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50/60 p-5">
      <h2 className="text-lg font-bold text-amber-900">
        クリエイター提供プロンプトの申請({pendingPresets.length}件)
      </h2>
      <p className="mt-1 text-sm text-amber-800">
        提供プロンプトと自動生成プレビューを確認し、承認(公開)または却下してください。
      </p>

      {error ? (
        <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        {pendingPresets.map((p) => (
          <div
            key={p.id}
            className="rounded-xl border border-amber-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-start gap-4">
              {/* サムネ */}
              <div className="relative aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                {p.thumbnailImageUrl ? (
                  <Image
                    src={p.thumbnailImageUrl}
                    alt={p.title}
                    fill
                    sizes="96px"
                    className="object-cover"
                    unoptimized
                  />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{p.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  対応: {(p.targetProviders ?? []).join(", ") || "—"}
                  {p.recommendedProvider
                    ? ` / 推奨: ${p.recommendedProvider}`
                    : ""}
                </p>
                {/* 提供プロンプト(admin のみ閲覧) */}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-slate-600">
                    提供プロンプトを表示(非公開)
                  </summary>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-700">
                    {p.stylingPrompt}
                  </pre>
                </details>
              </div>
            </div>

            {/* プレビュー */}
            <div className="mt-3 flex flex-wrap gap-3">
              {p.previewOpenaiImageUrl ? (
                <PreviewThumb label="ChatGPT" url={p.previewOpenaiImageUrl} />
              ) : null}
              {p.previewGeminiImageUrl ? (
                <PreviewThumb label="nanobanana" url={p.previewGeminiImageUrl} />
              ) : null}
              {!p.previewOpenaiImageUrl && !p.previewGeminiImageUrl ? (
                <p className="text-xs text-slate-400">
                  プレビュー生成中、または未生成です。
                </p>
              ) : null}
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                className="rounded-full bg-emerald-600 hover:bg-emerald-700"
                disabled={busyId === p.id}
                onClick={() => decide(p.id, "approve")}
              >
                {busyId === p.id ? "処理中..." : "承認して公開"}
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                disabled={busyId === p.id}
                onClick={() => decide(p.id, "reject")}
              >
                却下
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PreviewThumb({ label, url }: { label: string; url: string }) {
  return (
    <div className="text-center">
      <div className="relative aspect-[3/4] w-28 overflow-hidden rounded-lg bg-gray-100">
        <Image
          src={url}
          alt={`${label} プレビュー`}
          fill
          sizes="112px"
          className="object-cover"
          unoptimized
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}
