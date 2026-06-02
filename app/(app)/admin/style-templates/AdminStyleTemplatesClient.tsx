"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, User as UserIcon } from "lucide-react";
import {
  ImageLightboxDialog,
  type ImageLightboxSlide,
} from "@/features/inspire/components/ImageLightboxDialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

export interface AdminStyleTemplateItem {
  id: string;
  submitted_by_user_id: string;
  alt: string | null;
  moderation_status:
    | "draft"
    | "pending"
    | "visible"
    | "removed"
    | "withdrawn";
  moderation_reason: string | null;
  moderation_updated_at: string | null;
  moderation_decided_by: string | null;
  display_order: number;
  created_at: string;
  image_url: string | null;
  preview_openai_image_url: string | null;
  preview_gemini_image_url: string | null;
  submitter_profile: {
    nickname: string | null;
    avatar_url: string | null;
  };
  // Phase 5 で追加: Creator Looks 投稿の識別 (= バッジ表示用)
  is_creator_looks?: boolean;
  submission_source?: string | null;
}

interface Copy {
  tabPending: string;
  tabActive: string;
  tabRemoved: string;
  submittedAt: string;
  submitterId: string;
  submitterLabel: string;
  submitterAnonymous: string;
  submitterViewProfile: string;
  moderationReason: string;
  actionApprove: string;
  actionReject: string;
  actionUnpublish: string;
  reasonPlaceholder: string;
  confirmTitle: string;
  confirmAction: string;
  confirmCancel: string;
  decisionSuccess: string;
  decisionFailed: string;
  orderUpdateSuccess: string;
  orderUpdateFailed: string;
  moveUp: string;
  moveDown: string;
  emptyPending: string;
  emptyActive: string;
  emptyRemoved: string;
  detailLabel: string;
  detailClose: string;
  detailTemplate: string;
  detailPreviewOpenAI: string;
  detailPreviewGemini: string;
  detailEnlargedPrev: string;
  detailEnlargedNext: string;
}

interface AdminStyleTemplatesClientProps {
  initialItems: {
    pending: AdminStyleTemplateItem[];
    visible: AdminStyleTemplateItem[];
    removed: AdminStyleTemplateItem[];
  };
  copy: Copy;
}

type DecisionAction = "approve" | "reject" | "unpublish";

export function AdminStyleTemplatesClient({
  initialItems,
  copy,
}: AdminStyleTemplatesClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [openItem, setOpenItem] = useState<AdminStyleTemplateItem | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState<DecisionAction | null>(null);
  const [enlargedIndex, setEnlargedIndex] = useState<number | null>(null);

  // Creator Looks: admin が hidden_prompt を編集するための state
  const [hiddenPromptEditing, setHiddenPromptEditing] = useState(false);
  const [hiddenPromptDraft, setHiddenPromptDraft] = useState("");
  const [hiddenPromptSaving, setHiddenPromptSaving] = useState(false);
  // Creator Looks: admin が hidden_prompt を確認するための state
  // ADR-008 admin 信頼境界扱い (= devtools で見えても admin の責任とする)
  const [hiddenPrompt, setHiddenPrompt] = useState<string | null>(null);
  const [hiddenPromptLoading, setHiddenPromptLoading] = useState(false);
  const [hiddenPromptError, setHiddenPromptError] = useState<string | null>(null);

  // 詳細パネルの 3 つの画像（テンプレ → OpenAI → Gemini）。URL が無いものは除外。
  const lightboxSlides = useMemo<ImageLightboxSlide[]>(() => {
    if (!openItem) return [];
    const slides: ImageLightboxSlide[] = [];
    if (openItem.image_url) {
      slides.push({ url: openItem.image_url, label: copy.detailTemplate });
    }
    if (openItem.preview_openai_image_url) {
      slides.push({
        url: openItem.preview_openai_image_url,
        label: copy.detailPreviewOpenAI,
      });
    }
    if (openItem.preview_gemini_image_url) {
      slides.push({
        url: openItem.preview_gemini_image_url,
        label: copy.detailPreviewGemini,
      });
    }
    return slides;
  }, [openItem, copy.detailTemplate, copy.detailPreviewOpenAI, copy.detailPreviewGemini]);

  const openLightbox = useCallback(
    (url: string) => {
      const idx = lightboxSlides.findIndex((s) => s.url === url);
      if (idx >= 0) setEnlargedIndex(idx);
    },
    [lightboxSlides]
  );

  const closeDetail = useCallback(() => {
    setOpenItem(null);
    setReason("");
    setEnlargedIndex(null);
  }, []);

  const handleDecision = useCallback(
    async (action: DecisionAction) => {
      if (!openItem) return;
      setSubmitting(action);
      try {
        const response = await fetch(
          `/api/admin/style-templates/${openItem.id}/decision`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, reason: reason || null }),
          }
        );
        if (!response.ok) {
          toast({ title: copy.decisionFailed, variant: "destructive" });
          return;
        }
        toast({ title: copy.decisionSuccess });
        closeDetail();
        router.refresh();
      } finally {
        setSubmitting(null);
      }
    },
    [closeDetail, copy, openItem, reason, router, toast]
  );

  const handleOrderUpdate = useCallback(
    async (item: AdminStyleTemplateItem, delta: number) => {
      const next = Math.max(0, item.display_order + delta);
      const response = await fetch(
        `/api/admin/style-templates/${item.id}/order`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_order: next }),
        }
      );
      if (!response.ok) {
        toast({ title: copy.orderUpdateFailed, variant: "destructive" });
        return;
      }
      toast({ title: copy.orderUpdateSuccess });
      router.refresh();
    },
    [copy, router, toast]
  );

  const renderList = useCallback(
    (
      items: AdminStyleTemplateItem[],
      empty: string,
      showOrderControls: boolean
    ) => {
      if (items.length === 0) {
        return (
          <p className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            {empty}
          </p>
        );
      }
      return (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="overflow-hidden rounded-md border bg-card"
            >
              <button
                type="button"
                onClick={() => {
                  setReason(item.moderation_reason ?? "");
                  setOpenItem(item);
                }}
                className="block w-full text-left transition hover:opacity-90"
              >
                <div className="aspect-square w-full bg-muted">
                  {item.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.image_url}
                      alt={item.alt ?? ""}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
              </button>
              <div className="space-y-2 p-3 text-xs">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    <Badge variant="outline">{item.moderation_status}</Badge>
                    {item.is_creator_looks && (
                      <Badge
                        variant="default"
                        className="bg-primary/90 text-[10px] font-semibold"
                      >
                        Creator Looks
                      </Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    {item.created_at.slice(0, 10)}
                  </span>
                </div>
                <p className="line-clamp-1 text-muted-foreground">
                  {item.submitted_by_user_id.slice(0, 8)}…
                </p>
                {item.alt && (
                  <p className="line-clamp-2 text-muted-foreground">
                    {item.alt}
                  </p>
                )}
                {showOrderControls && (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-muted-foreground">
                      order: {item.display_order}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOrderUpdate(item, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOrderUpdate(item, 1)}
                      >
                        ↓
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      );
    },
    [handleOrderUpdate]
  );

  const isPending = openItem?.moderation_status === "pending";
  const isVisible = openItem?.moderation_status === "visible";

  return (
    <>
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            {copy.tabPending} ({initialItems.pending.length})
          </TabsTrigger>
          <TabsTrigger value="active">
            {copy.tabActive} ({initialItems.visible.length})
          </TabsTrigger>
          <TabsTrigger value="removed">
            {copy.tabRemoved} ({initialItems.removed.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {renderList(initialItems.pending, copy.emptyPending, false)}
        </TabsContent>
        <TabsContent value="active" className="mt-4">
          {renderList(initialItems.visible, copy.emptyActive, true)}
        </TabsContent>
        <TabsContent value="removed" className="mt-4">
          {renderList(initialItems.removed, copy.emptyRemoved, false)}
        </TabsContent>
      </Tabs>

      <Sheet
        open={openItem !== null}
        onOpenChange={(next) => {
          if (!next) closeDetail();
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader>
            <SheetTitle>{copy.detailLabel}</SheetTitle>
          </SheetHeader>

          {openItem && (
            <div className="mt-4 space-y-4">
              {/* 申請者カード: Avatar + nickname + ID をクリックで /admin/users/[id] へ */}
              <Link
                href={`/admin/users/${openItem.submitted_by_user_id}`}
                aria-label={copy.submitterViewProfile}
                className="group flex items-center gap-3 rounded-lg border bg-card p-3 transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Avatar className="size-10">
                  {openItem.submitter_profile.avatar_url ? (
                    <AvatarImage
                      src={openItem.submitter_profile.avatar_url}
                      alt=""
                    />
                  ) : null}
                  <AvatarFallback>
                    <UserIcon className="size-5" aria-hidden="true" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {copy.submitterLabel}
                  </p>
                  <p className="truncate text-sm font-medium">
                    {openItem.submitter_profile.nickname ?? copy.submitterAnonymous}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {openItem.submitted_by_user_id}
                  </p>
                </div>
                <ExternalLink
                  className="size-4 text-muted-foreground transition group-hover:text-foreground"
                  aria-hidden="true"
                />
              </Link>

              <p className="text-xs text-muted-foreground">
                <strong>{copy.submittedAt}:</strong>{" "}
                {`${openItem.created_at.slice(0, 10)} ${openItem.created_at.slice(11, 16)} UTC`}
              </p>

              {openItem.alt && (
                <p className="text-sm text-muted-foreground">{openItem.alt}</p>
              )}

              {/* Creator Looks 投稿の場合: 出所申告 + hidden_prompt 取得ボタン */}
              {openItem.is_creator_looks && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="default" className="bg-primary/90">
                      Creator Looks
                    </Badge>
                    {openItem.submission_source && (
                      <span className="text-muted-foreground">
                        source: {openItem.submission_source}
                      </span>
                    )}
                  </div>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={hiddenPromptLoading}
                      onClick={async () => {
                        setHiddenPromptLoading(true);
                        setHiddenPromptError(null);
                        setHiddenPrompt(null);
                        try {
                          const response = await fetch(
                            `/api/admin/creator-looks/${openItem.id}/secret`,
                          );
                          if (!response.ok) {
                            const data = await response
                              .json()
                              .catch(() => null);
                            setHiddenPromptError(
                              data?.error ?? `HTTP ${response.status}`,
                            );
                            return;
                          }
                          const data = (await response.json()) as {
                            hidden_prompt: string | null;
                            status: string;
                          };
                          if (data.status === "not_ready") {
                            setHiddenPromptError(
                              "hidden_prompt not yet generated",
                            );
                            return;
                          }
                          setHiddenPrompt(data.hidden_prompt);
                        } catch (e) {
                          setHiddenPromptError(
                            e instanceof Error ? e.message : String(e),
                          );
                        } finally {
                          setHiddenPromptLoading(false);
                        }
                      }}
                    >
                      {hiddenPromptLoading
                        ? "Loading hidden prompt..."
                        : "View hidden prompt (admin only)"}
                    </Button>
                  </div>
                  {hiddenPromptError && (
                    <p className="text-destructive">
                      Error: {hiddenPromptError}
                    </p>
                  )}
                  {hiddenPrompt && !hiddenPromptEditing && (
                    <>
                      <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded border bg-background p-2 font-mono text-[10px]">
                        {hiddenPrompt}
                      </pre>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setHiddenPromptDraft(hiddenPrompt);
                          setHiddenPromptEditing(true);
                          setHiddenPromptError(null);
                        }}
                      >
                        Edit hidden prompt
                      </Button>
                    </>
                  )}
                  {hiddenPromptEditing && (
                    <div className="space-y-2">
                      <textarea
                        value={hiddenPromptDraft}
                        onChange={(e) => setHiddenPromptDraft(e.target.value)}
                        className="h-64 w-full resize-y rounded border bg-background p-2 font-mono text-[10px]"
                        disabled={hiddenPromptSaving}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={
                            hiddenPromptSaving ||
                            hiddenPromptDraft.trim().length < 10
                          }
                          onClick={async () => {
                            if (!openItem) return;
                            setHiddenPromptSaving(true);
                            setHiddenPromptError(null);
                            try {
                              const response = await fetch(
                                `/api/admin/creator-looks/${openItem.id}/secret`,
                                {
                                  method: "PATCH",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    hidden_prompt: hiddenPromptDraft,
                                  }),
                                },
                              );
                              if (!response.ok) {
                                const data = await response
                                  .json()
                                  .catch(() => null);
                                setHiddenPromptError(
                                  data?.error ?? `HTTP ${response.status}`,
                                );
                                return;
                              }
                              setHiddenPrompt(hiddenPromptDraft);
                              setHiddenPromptEditing(false);
                            } catch (e) {
                              setHiddenPromptError(
                                e instanceof Error ? e.message : String(e),
                              );
                            } finally {
                              setHiddenPromptSaving(false);
                            }
                          }}
                        >
                          {hiddenPromptSaving ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={hiddenPromptSaving}
                          onClick={() => {
                            setHiddenPromptEditing(false);
                            setHiddenPromptDraft("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        保存すると admin プレビューが自動再生成されます。
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <figure className="space-y-1">
                  <figcaption className="text-xs font-medium">
                    {copy.detailTemplate}
                  </figcaption>
                  {openItem.image_url ? (
                    <button
                      type="button"
                      onClick={() => openLightbox(openItem.image_url!)}
                      className="block aspect-square w-full overflow-hidden rounded-md border bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      aria-label={copy.detailTemplate}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={openItem.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="aspect-square w-full overflow-hidden rounded-md border bg-muted" />
                  )}
                </figure>
                <figure className="space-y-1">
                  <figcaption className="text-xs font-medium">
                    {copy.detailPreviewOpenAI}
                  </figcaption>
                  {openItem.preview_openai_image_url ? (
                    <button
                      type="button"
                      onClick={() =>
                        openLightbox(openItem.preview_openai_image_url!)
                      }
                      className="block aspect-square w-full overflow-hidden rounded-md border bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      aria-label={copy.detailPreviewOpenAI}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={openItem.preview_openai_image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="aspect-square w-full overflow-hidden rounded-md border bg-muted" />
                  )}
                </figure>
                <figure className="space-y-1">
                  <figcaption className="text-xs font-medium">
                    {copy.detailPreviewGemini}
                  </figcaption>
                  {openItem.preview_gemini_image_url ? (
                    <button
                      type="button"
                      onClick={() =>
                        openLightbox(openItem.preview_gemini_image_url!)
                      }
                      className="block aspect-square w-full overflow-hidden rounded-md border bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      aria-label={copy.detailPreviewGemini}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={openItem.preview_gemini_image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="aspect-square w-full overflow-hidden rounded-md border bg-muted" />
                  )}
                </figure>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">{copy.moderationReason}</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={copy.reasonPlaceholder}
                  rows={3}
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {isPending && (
                  <>
                    <Button
                      onClick={() => handleDecision("approve")}
                      disabled={submitting !== null}
                    >
                      {copy.actionApprove}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => handleDecision("reject")}
                      disabled={submitting !== null}
                    >
                      {copy.actionReject}
                    </Button>
                  </>
                )}
                {isVisible && (
                  <Button
                    variant="destructive"
                    onClick={() => handleDecision("unpublish")}
                    disabled={submitting !== null}
                  >
                    {copy.actionUnpublish}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={closeDetail}
                  disabled={submitting !== null}
                >
                  {copy.detailClose}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ImageLightboxDialog
        slides={lightboxSlides}
        index={enlargedIndex}
        onIndexChange={setEnlargedIndex}
        prevLabel={copy.detailEnlargedPrev}
        nextLabel={copy.detailEnlargedNext}
      />
    </>
  );
}
