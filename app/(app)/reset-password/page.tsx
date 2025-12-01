"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { resetPasswordForEmail } from "@/features/auth/lib/auth-client";

export default function ResetPasswordRequestPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSuccess(false);

    if (!email) {
      setError("メールアドレスを入力してください");
      return;
    }

    setIsLoading(true);
    try {
      await resetPasswordForEmail(email);
      setIsSuccess(true);
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

  const handleGoToLogin = () => {
    router.push("/login");
  };

  // 成功画面
  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:pt-1">
        <Card className="w-full max-w-md p-4 sm:p-6">
          <div className="text-center">
            {/* 成功アイコン */}
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>

            {/* タイトル */}
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">
              メールを送信しました
            </h2>

            {/* メッセージ */}
            <div className="mb-6 space-y-2 text-left">
              <p className="text-sm text-gray-600 leading-relaxed">
                ご入力いただいたメールアドレスに、パスワード再設定用のメールをお送りしました。
              </p>
              <p className="text-sm text-gray-600 leading-relaxed">
                メールが届かない場合は、迷惑メールフォルダもご確認ください。
              </p>
            </div>

            {/* ログインボタン */}
            <Button
              onClick={handleGoToLogin}
              className="w-full"
              size="lg"
            >
              ログイン画面に戻る
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // 通常のフォーム画面
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:pt-1">
      <Card className="w-full max-w-md p-4 sm:p-6">
        <div className="mb-6 text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">パスワード再設定</h2>
          <p className="mt-2 text-sm text-gray-600">
            アカウントに登録しているメールアドレスを入力してください。
            パスワード再設定用のリンクをお送りします。
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
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


