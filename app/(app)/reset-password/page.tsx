"use client";

import { useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { resetPasswordForEmail } from "@/features/auth/lib/auth-client";

export default function ResetPasswordRequestPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!email) {
      setError("メールアドレスを入力してください");
      return;
    }

    setIsLoading(true);
    try {
      await resetPasswordForEmail(email);
      setSuccessMessage(
        "パスワード再設定用のメールを送信しました。メールボックスを確認してください。"
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "パスワードリセットメールの送信に失敗しました"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 pt-1">
      <Card className="w-full max-w-md p-6">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900">パスワード再設定</h2>
          <p className="mt-2 text-sm text-gray-600">
            アカウントに登録しているメールアドレスを入力してください。
            パスワード再設定用のリンクをお送りします。
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
            <Label htmlFor="reset-email">メールアドレス</Label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="pl-10"
                disabled={isLoading}
                required
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            メールを送信
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


