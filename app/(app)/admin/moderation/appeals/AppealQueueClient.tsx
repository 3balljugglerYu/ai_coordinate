"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

/**
 * 異議申立てキュー（クライアント側 fetch）
 *
 * データ取得は既存 ModerationQueueClient の fetchQueue パターンを踏襲する。
 * 投稿者向けの判定詳細ページはサーバーコンポーネント props 方式だが、
 * 「管理キューはクライアント fetch・一般画面はサーバー props」という既存の
 * 分担に合わせている。
 *
 * 用語の対応（取り違え防止）:
 *   認める   = overturn → status: overturned → 投稿は visible へ復帰
 *   棄却する = uphold   → status: upheld     → 投稿は removed のまま
 */

interface AppealQueueItem {
  id: string;
  post_id: string;
  removal_decision_id: string;
  appellant_id: string;
  status: "pending" | "upheld" | "overturned";
  body: string;
  appeal_deadline_at: string | null;
  created_at: string;
  policy_code: string | null;
  author_facing_reason: string | null;
  internal_note: string | null;
  post_image_url: string | null;
  hide_thumbnail: boolean;
  is_original_decider: boolean;
}

interface DraftState {
  note: string;
  independenceExceptionReason: string;
}

async function fetchAppeals(): Promise<AppealQueueItem[]> {
  const response = await fetch("/api/admin/moderation/appeals");
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "異議申立てキューの取得に失敗しました");
  }
  const data = (await response.json()) as { appeals: AppealQueueItem[] };
  return data.appeals || [];
}

async function decideAppeal(
  appealId: string,
  payload: {
    action: "uphold" | "overturn";
    note: string;
    independenceExceptionReason?: string;
  }
): Promise<void> {
  const response = await fetch(
    `/api/admin/moderation/appeals/${appealId}/decision`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "異議申立ての判定に失敗しました");
  }
}

export function AppealQueueClient() {
  const [appeals, setAppeals] = useState<AppealQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const { toast } = useToast();
  const router = useRouter();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const queue = await fetchAppeals();
      setAppeals(queue);
      setDrafts((prev) => {
        const next: Record<string, DraftState> = {};
        for (const appeal of queue) {
          next[appeal.id] =
            prev[appeal.id] ?? { note: "", independenceExceptionReason: "" };
        }
        return next;
      });
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "取得に失敗しました",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateDraft = (appealId: string, patch: Partial<DraftState>) => {
    setDrafts((prev) => ({
      ...prev,
      [appealId]: {
        ...(prev[appealId] ?? { note: "", independenceExceptionReason: "" }),
        ...patch,
      },
    }));
  };

  const handleDecision = async (
    appeal: AppealQueueItem,
    action: "uphold" | "overturn"
  ) => {
    const draft = drafts[appeal.id];
    if (!draft || draft.note.trim().length === 0) return;

    // 元の判定者が自分の場合は例外理由が必須（ADR-005）
    if (
      appeal.is_original_decider &&
      draft.independenceExceptionReason.trim().length === 0
    ) {
      toast({
        title: "入力が必要です",
        description:
          "元の判定を行ったのはあなたです。独立したレビューを実施できない理由を入力してください。",
        variant: "destructive",
      });
      return;
    }

    setProcessingId(appeal.id);
    try {
      await decideAppeal(appeal.id, {
        action,
        note: draft.note.trim(),
        independenceExceptionReason:
          draft.independenceExceptionReason.trim() || undefined,
      });
      setAppeals((prev) => prev.filter((item) => item.id !== appeal.id));
      toast({
        title: "反映しました",
        description:
          action === "overturn"
            ? "異議を認め、投稿の公開を再開しました"
            : "異議を棄却し、公開停止を維持しました",
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "判定に失敗しました",
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return <p className="py-8 text-center text-sm text-slate-600">読み込み中…</p>;
  }

  if (appeals.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-slate-600">審査待ちの異議申立てはありません。</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {appeals.map((appeal) => {
        const draft = drafts[appeal.id];
        const noteFilled = (draft?.note ?? "").trim().length > 0;

        return (
          <div
            key={appeal.id}
            className="space-y-4 rounded-lg border border-slate-200/80 bg-slate-50/50 p-5"
          >
            {appeal.is_original_decider && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                この公開停止を判定したのはあなたです。可能であれば別の担当者による
                レビューを優先してください。ご自身で審査する場合は、下部に理由の入力が必要です。
              </div>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-200/60">
                {appeal.hide_thumbnail || !appeal.post_image_url ? (
                  <div className="flex h-full items-center justify-center px-2 text-center text-[10px] text-slate-500">
                    画像非表示
                  </div>
                ) : (
                  <Image
                    src={appeal.post_image_url}
                    alt="appealed post"
                    fill
                    className="object-cover"
                    sizes="96px"
                    unoptimized
                  />
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <p className="text-xs text-slate-500">
                  申立て日時: {new Date(appeal.created_at).toLocaleString("ja-JP")}
                  {appeal.appeal_deadline_at && (
                    <>
                      {" / 期限: "}
                      {new Date(appeal.appeal_deadline_at).toLocaleString("ja-JP")}
                    </>
                  )}
                </p>
                <div>
                  <p className="text-xs font-semibold text-slate-700">元の判定</p>
                  <p className="text-xs text-slate-600">
                    ポリシー: {appeal.policy_code || "-"}
                  </p>
                  <p className="text-xs text-slate-600">
                    投稿者へ伝えた説明: {appeal.author_facing_reason || "-"}
                  </p>
                  {appeal.internal_note && (
                    <p className="text-xs text-slate-500">
                      内部メモ: {appeal.internal_note}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700">申立ての内容</p>
                  <p className="whitespace-pre-wrap text-sm text-slate-800">
                    {appeal.body}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
              <div className="space-y-2">
                <Label htmlFor={`note-${appeal.id}`}>
                  審査結果の理由
                  <span className="ml-1 text-xs font-semibold text-rose-600">
                    ※投稿者が読みます（必須）
                  </span>
                </Label>
                <Textarea
                  id={`note-${appeal.id}`}
                  value={draft?.note ?? ""}
                  onChange={(event) =>
                    updateDraft(appeal.id, { note: event.target.value })
                  }
                  maxLength={500}
                  rows={3}
                  placeholder="認容・棄却のいずれでも、投稿者が理解できる理由を記入してください。"
                />
              </div>

              {appeal.is_original_decider && (
                <div className="space-y-2">
                  <Label htmlFor={`independence-${appeal.id}`}>
                    独立したレビューを実施できない理由
                    <span className="ml-1 text-xs text-slate-500">
                      ※監査用に記録されます（必須）
                    </span>
                  </Label>
                  <Textarea
                    id={`independence-${appeal.id}`}
                    value={draft?.independenceExceptionReason ?? ""}
                    onChange={(event) =>
                      updateDraft(appeal.id, {
                        independenceExceptionReason: event.target.value,
                      })
                    }
                    maxLength={500}
                    rows={2}
                    placeholder="例: 現在の運営体制では他に審査できる担当者がいないため。"
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  disabled={processingId === appeal.id || !noteFilled}
                  onClick={() => handleDecision(appeal, "overturn")}
                >
                  認める（公開を再開）
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={processingId === appeal.id || !noteFilled}
                  onClick={() => handleDecision(appeal, "uphold")}
                >
                  棄却する（公開停止を維持）
                </Button>
                {!noteFilled && (
                  <span className="text-xs text-slate-500">
                    判定には審査結果の理由が必要です
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
