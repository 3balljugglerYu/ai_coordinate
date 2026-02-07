"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  deactivateAccount,
  getCurrentUser,
  signOut,
} from "@/features/auth/lib/auth-client";

interface DeactivateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeactivateAccountDialog({
  open,
  onOpenChange,
}: DeactivateAccountDialogProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEmailAuthUser, setIsEmailAuthUser] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    setConfirmText("");
    setPassword("");
    setError(null);

    getCurrentUser()
      .then((user) => {
        if (!active || !user) {
          return;
        }

        const provider = (user.app_metadata?.provider as string | undefined) ?? "";
        const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
        setIsEmailAuthUser(provider === "email" || providers.includes("email"));
      })
      .catch((err) => {
        console.error("Failed to get current user:", err);
      });

    return () => {
      active = false;
    };
  }, [open]);

  const isValidConfirmText = useMemo(() => confirmText === "DELETE", [confirmText]);

  const handleDeactivate = async () => {
    try {
      setError(null);

      if (!isValidConfirmText) {
        throw new Error("確認テキストに DELETE と入力してください");
      }

      if (isEmailAuthUser && !password) {
        throw new Error("本人確認のためパスワードを入力してください");
      }

      setIsSubmitting(true);

      const result = await deactivateAccount({
        confirmText,
        password: isEmailAuthUser ? password : undefined,
      });

      const scheduleText = result.scheduled_for
        ? new Date(result.scheduled_for).toLocaleDateString("ja-JP")
        : "30日後";

      toast({
        title: "退会を受け付けました",
        description: `${scheduleText} にアカウントを削除予定です。`,
      });

      await signOut();
      onOpenChange(false);
      router.push("/login?message=deactivated");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "退会処理に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-600">アカウントを削除する</DialogTitle>
          <DialogDescription>
            退会後はアカウントが凍結され、30日後に完全削除されます。30日以内は復帰できます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            この操作は最終的に取り消せません。削除後は同じメールアドレスで新規登録が可能になります。
          </div>

          <div className="space-y-2">
            <Label htmlFor="deactivate-confirm-text">確認のため DELETE と入力</Label>
            <Input
              id="deactivate-confirm-text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              disabled={isSubmitting}
            />
          </div>

          {isEmailAuthUser && (
            <div className="space-y-2">
              <Label htmlFor="deactivate-password">パスワード</Label>
              <Input
                id="deactivate-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="現在のパスワード"
                autoComplete="current-password"
                disabled={isSubmitting}
              />
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDeactivate}
            disabled={isSubmitting || !isValidConfirmText || (isEmailAuthUser && !password)}
          >
            {isSubmitting ? "処理中..." : "削除を申請する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
