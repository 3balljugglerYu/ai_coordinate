"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { UserStyleTemplateSubmissionDialog } from "./UserStyleTemplateSubmissionDialog";

type ModerationStatus =
  | "draft"
  | "pending"
  | "visible"
  | "removed"
  | "withdrawn";

interface MySubmittedTemplate {
  id: string;
  alt: string | null;
  moderation_status: ModerationStatus;
  moderation_reason: string | null;
  moderation_updated_at: string | null;
  created_at: string;
  image_url: string | null;
}

interface Copy {
  title: string;
  description: string;
  submitButton: string;
  emptyState: string;
  statusDraft: string;
  statusPending: string;
  statusVisible: string;
  statusRemoved: string;
  statusWithdrawn: string;
  withdrawAction: string;
  withdrawConfirmTitle: string;
  withdrawConfirmDescriptionDraft: string;
  withdrawConfirmDescriptionActive: string;
  withdrawConfirmAction: string;
  withdrawCancelAction: string;
  withdrawSuccess: string;
  withdrawFailed: string;
}

interface MySubmittedTemplatesCardClientProps {
  items: MySubmittedTemplate[];
  copy: Copy;
}

export function MySubmittedTemplatesCardClient({
  items,
  copy,
}: MySubmittedTemplatesCardClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingWithdraw, setPendingWithdraw] =
    useState<MySubmittedTemplate | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const statusLabel = useCallback(
    (status: ModerationStatus): string => {
      switch (status) {
        case "draft":
          return copy.statusDraft;
        case "pending":
          return copy.statusPending;
        case "visible":
          return copy.statusVisible;
        case "removed":
          return copy.statusRemoved;
        case "withdrawn":
          return copy.statusWithdrawn;
      }
    },
    [copy]
  );

  const statusVariant = useCallback(
    (status: ModerationStatus): "default" | "secondary" | "outline" => {
      if (status === "visible") return "default";
      if (status === "pending") return "secondary";
      return "outline";
    },
    []
  );

  const handleWithdraw = useCallback(async () => {
    if (!pendingWithdraw) return;
    setWithdrawing(true);
    try {
      const response = await fetch(
        `/api/style-templates/submissions/${pendingWithdraw.id}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        toast({
          title: copy.withdrawFailed,
          variant: "destructive",
        });
        return;
      }
      toast({ title: copy.withdrawSuccess });
      setPendingWithdraw(null);
      router.refresh();
    } finally {
      setWithdrawing(false);
    }
  }, [copy, pendingWithdraw, router, toast]);

  const isActionable = (status: ModerationStatus) =>
    status === "draft" || status === "pending" || status === "visible";

  return (
    <div className="mt-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{copy.title}</h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {copy.description}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>{copy.submitButton}</Button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          {copy.emptyState}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="overflow-hidden rounded-md border bg-card"
            >
              <div className="flex aspect-square items-center justify-center bg-muted">
                {item.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={item.image_url}
                    alt={item.alt ?? ""}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    no image
                  </span>
                )}
              </div>
              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={statusVariant(item.moderation_status)}>
                    {statusLabel(item.moderation_status)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                </div>
                {item.alt && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {item.alt}
                  </p>
                )}
                {item.moderation_reason &&
                  (item.moderation_status === "removed" ||
                    item.moderation_status === "withdrawn") && (
                    <p className="line-clamp-2 text-xs text-destructive">
                      {item.moderation_reason}
                    </p>
                  )}
                {isActionable(item.moderation_status) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingWithdraw(item)}
                    className="w-full"
                  >
                    {copy.withdrawAction}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <UserStyleTemplateSubmissionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmissionSucceeded={() => router.refresh()}
      />

      <AlertDialog
        open={pendingWithdraw !== null}
        onOpenChange={(next) => {
          if (!next) setPendingWithdraw(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.withdrawConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingWithdraw?.moderation_status === "draft"
                ? copy.withdrawConfirmDescriptionDraft
                : copy.withdrawConfirmDescriptionActive}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={withdrawing}>
              {copy.withdrawCancelAction}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleWithdraw}
              disabled={withdrawing}
            >
              {copy.withdrawConfirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
