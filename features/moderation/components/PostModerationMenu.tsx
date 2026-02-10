"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag, MoreHorizontal, Share2, ShieldBan } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { REPORT_TAXONOMY } from "@/constants/report-taxonomy";
import { reportPostAPI, blockUserAPI, getBlockStatusAPI, unblockUserAPI } from "@/features/moderation/lib/api";
import type { ReportCategoryId, ReportSubcategoryId } from "@/constants/report-taxonomy";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { sharePost } from "@/lib/share-post";
import { DEFAULT_SHARE_TEXT } from "@/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

interface PostModerationMenuProps {
  postId: string;
  authorUserId?: string | null;
  currentUserId?: string | null;
  onHidden?: () => void;
  align?: "start" | "center" | "end";
  showShare?: boolean;
  showBlock?: boolean;
}

export function PostModerationMenu({
  postId,
  authorUserId,
  currentUserId,
  onHidden,
  align = "end",
  showShare = false,
  showBlock = true,
}: PostModerationMenuProps) {
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [categoryId, setCategoryId] = useState<ReportCategoryId>(REPORT_TAXONOMY[0].id);
  const [subcategoryId, setSubcategoryId] = useState<ReportSubcategoryId>(
    REPORT_TAXONOMY[0].subcategories[0].id
  );
  const [details, setDetails] = useState("");
  const [isBlocked, setIsBlocked] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const redirectPath =
    searchParams?.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

  const canShowBlock = showBlock && Boolean(authorUserId && currentUserId && authorUserId !== currentUserId);
  const canShowReport = !(authorUserId && currentUserId && authorUserId === currentUserId);
  const canShowShare = showShare;
  const isPostDetailPage = pathname?.startsWith("/posts/") ?? false;
  const category = useMemo(
    () => REPORT_TAXONOMY.find((item) => item.id === categoryId) || REPORT_TAXONOMY[0],
    [categoryId]
  );

  useEffect(() => {
    if (!canShowBlock || !authorUserId) {
      return;
    }
    getBlockStatusAPI(authorUserId)
      .then((status) => {
        setIsBlocked(status.isBlocked);
      })
      .catch(() => {
        setIsBlocked(false);
      });
  }, [authorUserId, canShowBlock]);

  const requireLogin = () => {
    if (!currentUserId) {
      setShowAuthModal(true);
      return true;
    }
    return false;
  };

  const handleReport = async () => {
    if (requireLogin()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await reportPostAPI({
        postId,
        categoryId,
        subcategoryId,
        details: details.trim() || undefined,
      });
      toast({
        title: "通報を受け付けました",
        description: "内容を確認し、必要に応じて対応します。",
      });
      setIsReportDialogOpen(false);
      onHidden?.();
      if (isPostDetailPage) {
        router.replace("/?mod_refresh=1");
        router.refresh();
      }
    } catch (error) {
      toast({
        title: "通報できませんでした",
        description: error instanceof Error ? error.message : "時間をおいて再試行してください",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBlockToggle = async () => {
    if (requireLogin()) {
      return;
    }
    if (!authorUserId) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (isBlocked) {
        await unblockUserAPI(authorUserId);
        setIsBlocked(false);
        toast({
          title: "ブロックを解除しました",
        });
      } else {
        await blockUserAPI(authorUserId);
        setIsBlocked(true);
        toast({
          title: "ユーザーをブロックしました",
          description: "このユーザーの投稿は表示されません。",
        });
        onHidden?.();
        if (isPostDetailPage) {
          router.replace("/?mod_refresh=1");
          router.refresh();
        }
      }
      setIsBlockDialogOpen(false);
    } catch (error) {
      toast({
        title: isBlocked ? "解除できませんでした" : "ブロックできませんでした",
        description: error instanceof Error ? error.message : "時間をおいて再試行してください",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShare = async () => {
    try {
      const url = `${window.location.origin}/posts/${postId}`;
      const result = await sharePost(url, DEFAULT_SHARE_TEXT);

      if (result.method === "clipboard") {
        toast({
          title: "共有文をコピーしました",
          description: "SNSに貼り付けて投稿できます",
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      toast({
        title: "共有に失敗しました",
        description: error instanceof Error ? error.message : "時間をおいて再試行してください",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      {(canShowShare || canShowReport || canShowBlock) && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 p-0"
            aria-label="投稿メニュー"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align}>
          {canShowShare && (
            <DropdownMenuItem onClick={handleShare}>
              <Share2 className="mr-2 h-4 w-4" />
              シェアする
            </DropdownMenuItem>
          )}
          {canShowReport && (
            <DropdownMenuItem onClick={() => setIsReportDialogOpen(true)}>
              <Flag className="mr-2 h-4 w-4" />
              通報する
            </DropdownMenuItem>
          )}
          {canShowBlock && (
            <DropdownMenuItem onClick={() => setIsBlockDialogOpen(true)}>
              <ShieldBan className="mr-2 h-4 w-4" />
              {isBlocked ? "ブロック解除" : "ユーザーをブロック"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      )}

      <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>投稿を通報</DialogTitle>
            <DialogDescription>
              適切なカテゴリを選択してください。送信後、あなたの画面ではこの投稿を非表示にします。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>カテゴリ</Label>
              <Select
                value={categoryId}
                onValueChange={(value) => {
                  const nextCategory = REPORT_TAXONOMY.find((item) => item.id === value);
                  if (!nextCategory) {
                    return;
                  }
                  setCategoryId(nextCategory.id);
                  setSubcategoryId(nextCategory.subcategories[0].id);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="カテゴリを選択" />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TAXONOMY.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>サブカテゴリ</Label>
              <Select
                value={subcategoryId}
                onValueChange={(value) => setSubcategoryId(value as ReportSubcategoryId)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="サブカテゴリを選択" />
                </SelectTrigger>
                <SelectContent>
                  {category.subcategories.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>補足（任意）</Label>
              <Textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                maxLength={300}
                placeholder="補足があれば入力してください"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReportDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleReport} disabled={isSubmitting}>
              送信
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isBlockDialogOpen} onOpenChange={setIsBlockDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isBlocked ? "ブロックを解除しますか？" : "このユーザーをブロックしますか？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isBlocked
                ? "解除後、このユーザーの投稿が再び表示されるようになります。"
                : "ブロック後、このユーザーの投稿はホームから非表示になります。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleBlockToggle} disabled={isSubmitting}>
              {isBlocked ? "解除する" : "ブロックする"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AuthModal
        open={showAuthModal && !currentUserId}
        onClose={() => setShowAuthModal(false)}
        redirectTo={redirectPath}
      />
    </>
  );
}
