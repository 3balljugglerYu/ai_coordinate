"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
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

const MAX_REASON_LENGTH = 500;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DeductionResponse {
  success: boolean;
  new_balance?: number;
  amount_deducted?: number;
  message?: string;
  error?: string;
}

export function DeductionForm() {
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [currentIdempotencyKey, setCurrentIdempotencyKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<{
    userId?: string;
    amount?: string;
    reason?: string;
  }>({});

  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    if (!userId || userId.trim() === "") {
      newErrors.userId = "ユーザーIDを入力してください";
    } else if (!UUID_PATTERN.test(userId.trim())) {
      newErrors.userId = "ユーザーIDはUUID形式で入力してください";
    }

    if (amount === "" || amount === null || amount === undefined) {
      newErrors.amount = "ペルコイン数を入力してください";
    } else if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1) {
      newErrors.amount = "ペルコイン数は1以上の整数で入力してください";
    }

    if (!reason || reason.trim() === "") {
      newErrors.reason = "減算理由を入力してください";
    } else if (reason.length > MAX_REASON_LENGTH) {
      newErrors.reason = `減算理由は${MAX_REASON_LENGTH}文字以内で入力してください`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!validateForm()) {
      return;
    }

    setConfirmDialogOpen(true);
  };

  const handleConfirmDeduction = async () => {
    if (!validateForm()) {
      setConfirmDialogOpen(false);
      return;
    }

    // 冪等キー: 初回は生成、再試行時は同じキーを再利用（二重減算防止）
    const idempotencyKey = currentIdempotencyKey ?? crypto.randomUUID();
    if (!currentIdempotencyKey) {
      setCurrentIdempotencyKey(idempotencyKey);
    }

    setIsSubmitting(true);
    setConfirmDialogOpen(false);

    try {
      const response = await fetch("/api/admin/deduction", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId.trim(),
          amount: Number(amount),
          reason: reason.trim(),
          idempotency_key: idempotencyKey,
        }),
      });

      const data: DeductionResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "ペルコイン減算に失敗しました");
      }

      if (data.success) {
        let description: string;
        if (data.message) {
          description = data.message;
        } else {
          description = `${data.amount_deducted ?? amount}ペルコインを減算しました。`;
          if (data.new_balance !== undefined) {
            description += ` 新しい残高: ${data.new_balance}ペルコイン`;
          }
        }

        toast({
          title: "減算成功",
          description,
          variant: "default",
        });

        setUserId("");
        setAmount("");
        setReason("");
        setCurrentIdempotencyKey(null);
      } else {
        throw new Error(data.error || "ペルコイン減算に失敗しました");
      }
    } catch (error) {
      console.error("Deduction error:", error);
      toast({
        title: "エラー",
        description:
          error instanceof Error
            ? error.message
            : "ペルコイン減算に失敗しました。もう一度お試しください。",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const remainingChars = MAX_REASON_LENGTH - reason.length;
  const isReasonOverLimit = reason.length > MAX_REASON_LENGTH;

  return (
    <div className="max-w-xl space-y-6 px-1 sm:px-0">
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="user_id">
          ユーザーID <span className="text-destructive">*</span>
        </Label>
        <Input
          id="user_id"
          type="text"
          placeholder="dfe54c3c-3764-4758-89eb-2bd445fdc4c6"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          disabled={isSubmitting}
          aria-invalid={!!errors.userId}
        />
        {errors.userId && (
          <p className="text-sm text-destructive">{errors.userId}</p>
        )}
        <p className="text-sm text-slate-600">
          UUID形式のユーザーIDを入力してください
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="amount">
          減算量（ペルコイン数） <span className="text-destructive">*</span>
        </Label>
        <Input
          id="amount"
          type="number"
          min="1"
          step="1"
          placeholder="100"
          value={amount}
          onChange={(e) => {
            const value = e.target.value;
            setAmount(value === "" ? "" : Number.parseInt(value, 10));
          }}
          disabled={isSubmitting}
          aria-invalid={!!errors.amount}
        />
        {errors.amount && (
          <p className="text-sm text-destructive">{errors.amount}</p>
        )}
        <p className="text-sm text-slate-600">
          1以上の整数で入力してください。残高不足の場合は減算可能な分のみ減算されます。
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reason">
          減算理由 <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="reason"
          placeholder="例: Stripe手動返金 pi_xxx、誤付与の訂正"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={isSubmitting}
          rows={4}
          maxLength={MAX_REASON_LENGTH + 100}
          aria-invalid={!!errors.reason || isReasonOverLimit}
        />
        <div className="flex items-center justify-between">
          {errors.reason && (
            <p className="text-sm text-destructive">{errors.reason}</p>
          )}
          <p
            className={`text-sm ml-auto ${
              isReasonOverLimit
                ? "text-destructive"
                : remainingChars < 50
                  ? "text-orange-600"
                  : "text-slate-600"
            }`}
          >
            {remainingChars}文字 / {MAX_REASON_LENGTH}文字
          </p>
        </div>
        <p className="text-sm text-slate-600">
          減算理由は取引履歴の表示名として使用されます（最大{MAX_REASON_LENGTH}文字）
        </p>
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "減算中..." : "減算を実行"}
      </Button>
    </form>

    <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>ペルコイン減算の確認</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left">
              <p>以下の内容で減算を実行します。問題がないか確認してください。</p>
              <dl className="mt-3 space-y-1 rounded-md bg-muted/50 p-3 text-sm">
                <div className="flex gap-2">
                  <dt className="font-medium text-muted-foreground">ユーザーID:</dt>
                  <dd className="break-all">{userId.trim()}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-medium text-muted-foreground">減算量:</dt>
                  <dd>{amount}ペルコイン</dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="font-medium text-muted-foreground">減算理由:</dt>
                  <dd className="whitespace-pre-wrap break-words">{reason.trim()}</dd>
                </div>
              </dl>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>キャンセル</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmDeduction} disabled={isSubmitting}>
            減算を実行
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </div>
  );
}
