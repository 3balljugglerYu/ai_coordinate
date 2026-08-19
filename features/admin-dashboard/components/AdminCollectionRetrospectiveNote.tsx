"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** DB の CHECK・API の検証と一致させること。 */
const MAX_LENGTH = 4000;

/**
 * 企画ごとの「所見」欄(ADR-004)。
 *
 * 数字は自動で出せるが、**そこから何を読み取ったかは人しか書けない**。
 * 「離脱は最初の2枚に集中している」「新規18名が1人も戻っていない」といった
 * 一文が、次の企画を設計するときに効く。数字だけ残って理由が消えると、
 * 半年後に同じ検討をやり直すことになる。
 *
 * 保存は既存の preset-categories PATCH を通す(監査ログもそちらに乗る)。
 * 更新時刻はサーバー側で入るため、ここからは送らない。
 */
export function AdminCollectionRetrospectiveNote({
  categoryId,
  displayName,
  note,
  noteUpdatedAt,
  onSaved,
}: {
  categoryId: string;
  displayName: string;
  note: string | null;
  noteUpdatedAt: string | null;
  /** 保存後に親のデータを取り直させる */
  onSaved: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 企画を切り替えたら下書きも入れ替える(前の企画の所見を残さない)
  useEffect(() => {
    setDraft(note ?? "");
    setIsEditing(false);
    setError(null);
  }, [note, categoryId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/preset-categories/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retrospective_note: draft }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? `保存に失敗しました (${res.status})`);
        return;
      }
      setIsEditing(false);
      onSaved();
    } catch {
      setError("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const updatedLabel = noteUpdatedAt
    ? new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Tokyo",
      }).format(new Date(noteUpdatedAt))
    : null;

  return (
    <section className="rounded-2xl border border-violet-200/70 bg-white/95 p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          所見 — {displayName}
        </h3>
        {isEditing ? null : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-xs font-medium text-violet-700 underline hover:text-violet-900"
          >
            {note ? "編集" : "書く"}
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={MAX_LENGTH}
            rows={6}
            placeholder={
              "この企画の数字から読み取ったことと、次回への申し送りを書きます。\n" +
              "例: 離脱は最初の2枚に集中。4枚以上進んだ人の82.6%が完走した。\n" +
              "　　会期中に登録した18名が1人も戻っていない ← 要対策"
            }
            className="w-full rounded-md border border-slate-300 p-3 text-sm leading-6 text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setDraft(note ?? "");
                setIsEditing(false);
                setError(null);
              }}
              disabled={saving}
              className="text-xs text-slate-600 underline hover:text-slate-900"
            >
              取り消す
            </button>
            <span className="ml-auto text-[11px] tabular-nums text-slate-400">
              {draft.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}
            </span>
          </div>
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      ) : note ? (
        <>
          {/* 改行をそのまま出す。箇条書きで書かれることが多い */}
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
            {note}
          </p>
          {updatedLabel ? (
            <p className="mt-2 text-[11px] text-slate-400">
              {updatedLabel} 更新
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-slate-500">
          まだ所見はありません。数字から読み取ったことを残しておくと、
          この画面がそのまま振り返り資料になります。
        </p>
      )}
    </section>
  );
}
