"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";

const MAX_REASON_LENGTH = 500;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GrantBonusResponse {
  success: boolean;
  new_balance?: number;
  transaction_id?: string;
  amount_granted?: number;
  message?: string;
  error?: string;
}

export function BonusGrantForm() {
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [sendNotification, setSendNotification] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    userId?: string;
    amount?: string;
    reason?: string;
  }>({});

  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    // ユーザーIDのバリデーション
    if (!userId || userId.trim() === "") {
      newErrors.userId = "ユーザーIDを入力してください";
    } else if (!UUID_PATTERN.test(userId.trim())) {
      newErrors.userId = "ユーザーIDはUUID形式で入力してください";
    }

    // ペルコイン数のバリデーション
    if (amount === "" || amount === null || amount === undefined) {
      newErrors.amount = "ペルコイン数を入力してください";
    } else if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1) {
      newErrors.amount = "ペルコイン数は1以上の整数で入力してください";
    }

    // 付与理由のバリデーション
    if (!reason || reason.trim() === "") {
      newErrors.reason = "付与理由を入力してください";
    } else if (reason.length > MAX_REASON_LENGTH) {
      newErrors.reason = `付与理由は${MAX_REASON_LENGTH}文字以内で入力してください`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/bonus/grant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId.trim(),
          amount: Number(amount),
          reason: reason.trim(),
          send_notification: sendNotification,
        }),
      });

      const data: GrantBonusResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "ボーナス付与に失敗しました");
      }

      if (data.success) {
        // APIがmessageを返している場合はそれを優先使用
        // そうでない場合は、new_balanceの有無に応じてメッセージを構築
        let description: string;
        if (data.message) {
          description = data.message;
        } else {
          description = `${data.amount_granted}ペルコインを付与しました。`;
          if (data.new_balance !== undefined) {
            description += ` 新しい残高: ${data.new_balance}ペルコイン`;
          }
        }

        toast({
          title: "ボーナス付与成功",
          description,
          variant: "default",
        });

        // フォームをリセット
        setUserId("");
        setAmount("");
        setReason("");
        setSendNotification(true);
      } else {
        throw new Error(data.error || "ボーナス付与に失敗しました");
      }
    } catch (error) {
      console.error("Bonus grant error:", error);
      toast({
        title: "エラー",
        description:
          error instanceof Error
            ? error.message
            : "ボーナス付与に失敗しました。もう一度お試しください。",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const remainingChars = MAX_REASON_LENGTH - reason.length;
  const isReasonOverLimit = reason.length > MAX_REASON_LENGTH;

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-6 px-1 sm:px-0">
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
          ペルコイン数 <span className="text-destructive">*</span>
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
          1以上の整数で入力してください
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reason">
          付与理由 <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="reason"
          placeholder="例: キャンペーン特典、補償対応など"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={isSubmitting}
          rows={4}
          maxLength={MAX_REASON_LENGTH + 100} // ブラウザのmaxLength制限を緩和（クライアント側でバリデーション）
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
          付与理由は取引履歴の表示名として使用されます（最大{MAX_REASON_LENGTH}文字）
        </p>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="send_notification"
          checked={sendNotification}
          onCheckedChange={(checked) =>
            setSendNotification(checked === true)
          }
          disabled={isSubmitting}
        />
        <Label
          htmlFor="send_notification"
          className="text-sm font-normal cursor-pointer"
        >
          通知を送信する
        </Label>
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "付与中..." : "ボーナスを付与"}
      </Button>
    </form>
  );
}
