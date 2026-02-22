"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { ShieldBan, UserCheck, Loader2 } from "lucide-react";

interface UserDetailActionsProps {
  userId: string;
  isDeactivated: boolean;
}

export function UserDetailActions({
  userId,
  isDeactivated,
}: UserDetailActionsProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSuspend = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "停止に失敗しました");
      toast({ title: "ユーザーを停止しました" });
      window.location.reload();
    } catch (err) {
      toast({
        title: "エラー",
        description: err instanceof Error ? err.message : "停止に失敗しました",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReactivate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reactivate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "復帰に失敗しました");
      toast({ title: "ユーザーを復帰させました" });
      window.location.reload();
    } catch (err) {
      toast({
        title: "エラー",
        description: err instanceof Error ? err.message : "復帰に失敗しました",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      {isDeactivated ? (
        <Button
          variant="outline"
          size="sm"
          onClick={handleReactivate}
          disabled={loading}
          className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserCheck className="h-4 w-4" />
          )}
          復帰させる
        </Button>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <ShieldBan className="h-4 w-4" />
              停止する
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ユーザーを停止しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                停止すると、このユーザーはログインできなくなります。復帰は管理者画面から行えます。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>キャンセル</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={handleSuspend}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "停止する"
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
