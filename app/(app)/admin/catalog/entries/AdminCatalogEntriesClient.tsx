"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import type { AdminCatalogEntryRow } from "@/features/catalog/lib/admin-repository";

interface EnrichedEntry extends AdminCatalogEntryRow {
  image_url: string | null;
}

interface Props {
  initialPending: EnrichedEntry[];
  initialApproved: EnrichedEntry[];
  initialRejected: EnrichedEntry[];
  campaignsById: Record<string, { slug: string; title: string }>;
}

type TabKey = "pending" | "approved" | "rejected";

function formatUtcMinute(value: string): string {
  return `${value.slice(0, 10)} ${value.slice(11, 16)} UTC`;
}

export function AdminCatalogEntriesClient({
  initialPending,
  initialApproved,
  initialRejected,
  campaignsById,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [pending, setPending] = useState<EnrichedEntry[]>(initialPending);
  const [approved, setApproved] = useState<EnrichedEntry[]>(initialApproved);
  const [rejected, setRejected] = useState<EnrichedEntry[]>(initialRejected);
  const [rejectionReasons, setRejectionReasons] = useState<
    Record<string, string>
  >({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const moveEntry = useCallback(
    (
      entryId: string,
      action: "approve" | "reject" | "unpublish",
      sourceTab: TabKey,
    ) => {
      const sources = {
        pending: { list: pending, setter: setPending },
        approved: { list: approved, setter: setApproved },
        rejected: { list: rejected, setter: setRejected },
      } as const;

      const targetTab: TabKey = action === "approve" ? "approved" : "rejected";
      const source = sources[sourceTab];
      const target = sources[targetTab];

      const entry = source.list.find((e) => e.id === entryId);
      if (!entry) return;

      source.setter((prev) => prev.filter((e) => e.id !== entryId));
      target.setter((prev) => [
        {
          ...entry,
          status: action === "approve" ? "approved" : "rejected",
          approved_at:
            action === "approve" ? new Date().toISOString() : entry.approved_at,
        },
        ...prev,
      ]);
    },
    [pending, approved, rejected],
  );

  const handleDecision = useCallback(
    async (
      entry: EnrichedEntry,
      action: "approve" | "reject" | "unpublish",
    ) => {
      const reason =
        action === "approve" ? null : rejectionReasons[entry.id]?.trim() || null;

      if (action !== "approve" && (!reason || reason.length === 0)) {
        toast({
          variant: "destructive",
          title: "理由が必須です",
          description: "差戻し / 非公開化には理由を入力してください。",
        });
        return;
      }

      setProcessingId(entry.id);
      try {
        const response = await fetch(
          `/api/admin/catalog/entries/${entry.id}/decision`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, reason: reason ?? null }),
          },
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? "操作に失敗しました");
        }
        moveEntry(entry.id, action, activeTab);
        toast({
          title:
            action === "approve"
              ? "承認しました"
              : action === "reject"
                ? "差戻しました"
                : "非公開化しました",
        });
        router.refresh();
      } catch (err) {
        toast({
          variant: "destructive",
          title: "操作に失敗しました",
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setProcessingId(null);
      }
    },
    [activeTab, moveEntry, rejectionReasons, router, toast],
  );

  const currentList =
    activeTab === "pending"
      ? pending
      : activeTab === "approved"
        ? approved
        : rejected;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-200">
        {(
          [
            { key: "pending", label: `審査待ち (${pending.length})` },
            { key: "approved", label: `公開中 (${approved.length})` },
            { key: "rejected", label: `非公開 (${rejected.length})` },
          ] satisfies Array<{ key: TabKey; label: string }>
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {currentList.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
          このタブには表示する申請がありません。
        </p>
      ) : (
        <ul className="space-y-4">
          {currentList.map((entry) => {
            const campaign = campaignsById[entry.campaign_id];
            const isProcessing = processingId === entry.id;
            return (
              <li
                key={entry.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-4 md:flex-row">
                  <div className="md:w-48 md:shrink-0">
                    {entry.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={entry.image_url}
                        alt={entry.alt ?? entry.display_name}
                        className="w-full rounded-md object-cover"
                      />
                    ) : (
                      <div className="aspect-square w-full rounded-md bg-slate-100" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2 text-sm">
                    <div>
                      <span className="font-medium text-slate-900">
                        {entry.display_name}
                      </span>
                      <span className="ml-2 text-slate-500">
                        企画: {campaign?.title ?? "不明"}{" "}
                        {campaign && (
                          <code className="rounded bg-slate-100 px-1 text-xs">
                            /catalog/{campaign.slug}
                          </code>
                        )}
                      </span>
                    </div>
                    <div className="text-slate-600">
                      X アカウント:{" "}
                      <a
                        href={entry.x_account_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline"
                      >
                        {entry.x_account_url}
                      </a>
                    </div>
                    <div className="text-slate-600">
                      ツイート:{" "}
                      <a
                        href={entry.source_tweet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline"
                      >
                        ツイートを開く
                      </a>
                    </div>
                    {entry.submitter_email ? (
                      <div className="text-slate-600">
                        通知先メール: {entry.submitter_email}
                      </div>
                    ) : null}
                    {entry.alt ? (
                      <div className="text-slate-500">説明: {entry.alt}</div>
                    ) : null}
                    {entry.rejection_reason ? (
                      <div className="text-red-700">
                        差戻し理由: {entry.rejection_reason}
                      </div>
                    ) : null}
                    <div className="text-xs text-slate-400">
                      申請日時: {formatUtcMinute(entry.created_at)}
                    </div>

                    {activeTab !== "approved" && (
                      <Textarea
                        placeholder="差戻し / 非公開化の理由を入力 (承認時は不要)"
                        value={rejectionReasons[entry.id] ?? ""}
                        onChange={(e) =>
                          setRejectionReasons((s) => ({
                            ...s,
                            [entry.id]: e.target.value,
                          }))
                        }
                        className="mt-2"
                      />
                    )}
                    {activeTab === "approved" && (
                      <Textarea
                        placeholder="非公開化する場合の理由を入力"
                        value={rejectionReasons[entry.id] ?? ""}
                        onChange={(e) =>
                          setRejectionReasons((s) => ({
                            ...s,
                            [entry.id]: e.target.value,
                          }))
                        }
                        className="mt-2"
                      />
                    )}

                    <div className="mt-2 flex gap-2">
                      {activeTab === "pending" && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleDecision(entry, "approve")}
                            disabled={isProcessing}
                          >
                            承認
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDecision(entry, "reject")}
                            disabled={isProcessing}
                          >
                            差戻し
                          </Button>
                        </>
                      )}
                      {activeTab === "approved" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDecision(entry, "unpublish")}
                          disabled={isProcessing}
                        >
                          非公開化
                        </Button>
                      )}
                      {activeTab === "rejected" && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleDecision(entry, "approve")}
                          disabled={isProcessing}
                        >
                          再承認
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
