"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, User as UserIcon } from "lucide-react";
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
        setOpenItem(null);
        setReason("");
        router.refresh();
      } finally {
        setSubmitting(null);
      }
    },
    [copy, openItem, reason, router, toast]
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
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{item.moderation_status}</Badge>
                  <span className="text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString()}
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
          if (!next) {
            setOpenItem(null);
            setReason("");
          }
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
                {new Date(openItem.created_at).toLocaleString()}
              </p>

              {openItem.alt && (
                <p className="text-sm text-muted-foreground">{openItem.alt}</p>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <figure className="space-y-1">
                  <figcaption className="text-xs font-medium">
                    {copy.detailTemplate}
                  </figcaption>
                  <div className="aspect-square w-full overflow-hidden rounded-md border bg-muted">
                    {openItem.image_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={openItem.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                </figure>
                <figure className="space-y-1">
                  <figcaption className="text-xs font-medium">
                    {copy.detailPreviewOpenAI}
                  </figcaption>
                  <div className="aspect-square w-full overflow-hidden rounded-md border bg-muted">
                    {openItem.preview_openai_image_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={openItem.preview_openai_image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                </figure>
                <figure className="space-y-1">
                  <figcaption className="text-xs font-medium">
                    {copy.detailPreviewGemini}
                  </figcaption>
                  <div className="aspect-square w-full overflow-hidden rounded-md border bg-muted">
                    {openItem.preview_gemini_image_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={openItem.preview_gemini_image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
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
                  onClick={() => setOpenItem(null)}
                  disabled={submitting !== null}
                >
                  {copy.detailClose}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
