"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { updatePassword } from "@/features/auth/lib/auth-client";

export default function ResetPasswordConfirmPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!password || !confirmPassword) {
      setError("新しいパスワードを2回入力してください");
      return;
    }

    if (password.length < 6) {
      setError("パスワードは6文字以上で入力してください");
      return;
    }

    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }

    setIsLoading(true);
    try {
      await updatePassword(password);
      setSuccessMessage("パスワードを更新しました。ログイン画面に移動します。");
      // 少し待ってからログイン画面へ遷移
      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "パスワードの更新に失敗しました。リンクの有効期限が切れている可能性があります。"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 pt-1">
      <Card className="w-full max-w-md p-6">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900">新しいパスワードの設定</h2>
          <p className="mt-2 text-sm text-gray-600">
            新しいパスワードを入力してください。
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <p className="text-sm">{error}</p>
          </Alert>
        )}

        {successMessage && (
          <Alert className="mb-4">
            <p className="text-sm">{successMessage}</p>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="new-password">新しいパスワード</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-10"
                disabled={isLoading}
                required
                minLength={6}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="confirm-new-password">新しいパスワード（確認）</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                id="confirm-new-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-10"
                disabled={isLoading}
                required
                minLength={6}
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            パスワードを更新
          </Button>
        </form>

        <div className="mt-6 text-center text-sm">
          <a href="/login" className="font-medium text-primary hover:underline">
            ログイン画面に戻る
          </a>
        </div>
      </Card>
    </div>
  );
}


