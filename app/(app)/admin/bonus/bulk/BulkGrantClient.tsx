"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Download, Loader2, Check } from "lucide-react";
import {
  ADMIN_PERCOIN_BALANCE_TYPES,
  ADMIN_PERCOIN_BALANCE_TYPE_DESCRIPTIONS,
  ADMIN_PERCOIN_BALANCE_TYPE_LABELS,
  DEFAULT_ADMIN_PERCOIN_BALANCE_TYPE,
  isAdminPercoinBalanceType,
  type AdminPercoinBalanceType,
} from "@/features/credits/lib/admin-percoin-balance-type";

const MAX_REASON_LENGTH = 500;
const MAX_ROWS = 300;

function formatJapanTime(date: Date): string {
  return (
    date.toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" }) + " JST"
  );
}

interface BulkRow {
  email: string;
  amount: number;
  balanceBefore: number | null;
  status: "pending" | "found" | "not_found";
}

type GrantResult =
  | {
      email: string;
      status: "success";
      user_id: string;
      balance_before: number;
      amount_granted: number;
      balance_after: number;
    }
  | { email: string; status: "skipped"; error: string }
  | { email: string; status: "error"; error: string };

function parseCsv(text: string): { email: string; amount: number }[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].toLowerCase();
  const hasHeader =
    header.includes("email") && (header.includes("amount") || header.includes("ポイント"));
  const start = hasHeader ? 1 : 0;
  const rows: { email: string; amount: number }[] = [];
  for (let i = start; i < lines.length && rows.length < MAX_ROWS; i++) {
    const parts = lines[i].split(",").map((p) => p.trim());
    if (parts.length < 2) continue;
    const email = parts[0];
    const amount = parseInt(parts[1], 10);
    if (!email || !Number.isInteger(amount) || amount < 1) continue;
    rows.push({ email, amount });
  }
  return rows;
}

function buildResultCsv(results: GrantResult[], grantedAt: Date): string {
  const grantedAtStr = formatJapanTime(grantedAt);
  const header =
    "email,status,balance_before,amount_granted,balance_after,error,granted_at";
  const lines = results.map((r) => {
    if (r.status === "success") {
      return `${r.email},success,${r.balance_before},${r.amount_granted},${r.balance_after},,${grantedAtStr}`;
    }
    return `${r.email},${r.status},,,,${r.error},${grantedAtStr}`;
  });
  return [header, ...lines].join("\n");
}

function buildNotFoundCsv(
  rows: BulkRow[],
  lookupAt: Date
): string {
  const notFoundRows = rows.filter((r) => r.status === "not_found");
  const lookupAtStr = formatJapanTime(lookupAt);
  const header = "email,amount,lookup_at";
  const lines = notFoundRows.map(
    (r) => `${r.email},${r.amount},${lookupAtStr}`
  );
  return [header, ...lines].join("\n");
}

export function BulkGrantClient() {
  const { toast } = useToast();
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [balanceType, setBalanceType] = useState<AdminPercoinBalanceType>(
    DEFAULT_ADMIN_PERCOIN_BALANCE_TYPE
  );
  const [reason, setReason] = useState("");
  const [sendNotification, setSendNotification] = useState(true);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isGranting, setIsGranting] = useState(false);
  const [grantResults, setGrantResults] = useState<GrantResult[] | null>(null);
  const [grantedAt, setGrantedAt] = useState<Date | null>(null);
  const [lookupAt, setLookupAt] = useState<Date | null>(null);
  const [errors, setErrors] = useState<{ reason?: string }>({});

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        const parsed = parseCsv(text);
        setRows(
          parsed.map((p) => ({
            email: p.email,
            amount: p.amount,
            balanceBefore: null,
            status: "pending" as const,
          }))
        );
        setGrantResults(null);
        setGrantedAt(null);
        setLookupAt(null);
      };
      reader.readAsText(file, "UTF-8");
      e.target.value = "";
    },
    []
  );

  const handleLookup = useCallback(async () => {
    if (rows.length === 0) {
      toast({
        title: "エラー",
        description: "CSVをアップロードしてください",
        variant: "destructive",
      });
      return;
    }
    setIsLookingUp(true);
    try {
      const res = await fetch("/api/admin/bonus/bulk-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: rows.map((r) => r.email),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "登録確認に失敗しました");
      }
      const userMap = new Map<
        string,
        { user_id: string; balance: number }
      >();
      for (const u of data.users ?? []) {
        userMap.set(u.email, { user_id: u.user_id, balance: u.balance });
      }
      setRows((prev) =>
        prev.map((r) => {
          const u = userMap.get(r.email);
          if (u) {
            return {
              ...r,
              balanceBefore: u.balance,
              status: "found" as const,
            };
          }
          return { ...r, status: "not_found" as const };
        })
      );
      setLookupAt(new Date());
      const notFound = data.not_found?.length ?? 0;
      toast({
        title: "登録確認完了",
        description: `登録済み: ${data.users?.length ?? 0}件、未登録: ${notFound}件`,
        variant: "default",
      });
    } catch (err) {
      toast({
        title: "エラー",
        description:
          err instanceof Error ? err.message : "登録確認に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLookingUp(false);
    }
  }, [rows, toast]);

  const notFoundRows = rows.filter((r) => r.status === "not_found");
  const handleDownloadNotFound = useCallback(() => {
    if (notFoundRows.length === 0 || !lookupAt) return;
    const csv = buildNotFoundCsv(rows, lookupAt);
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `not_found_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, lookupAt]);

  const handleAmountChange = useCallback((index: number, value: number) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, amount: value } : r))
    );
  }, []);

  const handleGrant = useCallback(async () => {
    const newErrors: { reason?: string } = {};
    if (!reason.trim()) {
      newErrors.reason = "付与理由を入力してください";
    } else if (reason.length > MAX_REASON_LENGTH) {
      newErrors.reason = `付与理由は${MAX_REASON_LENGTH}文字以内で入力してください`;
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const toGrant = rows.filter((r) => r.status === "found");
    if (toGrant.length === 0) {
      toast({
        title: "エラー",
        description: "付与対象がありません。登録確認を実行してください。",
        variant: "destructive",
      });
      return;
    }

    setIsGranting(true);
    setGrantResults(null);
    try {
      const res = await fetch("/api/admin/bonus/grant-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grants: toGrant.map((r) => ({ email: r.email, amount: r.amount })),
          balance_type: balanceType,
          reason: reason.trim(),
          send_notification: sendNotification,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "一括付与に失敗しました");
      }
      setGrantResults(data.results ?? []);
      setGrantedAt(new Date());
      toast({
        title: "一括付与完了",
        description: data.message ?? "処理が完了しました",
        variant: "default",
      });
    } catch (err) {
      toast({
        title: "エラー",
        description:
          err instanceof Error ? err.message : "一括付与に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsGranting(false);
    }
  }, [rows, balanceType, reason, sendNotification, toast]);

  const handleDownloadResult = useCallback(() => {
    if (!grantResults || grantResults.length === 0 || !grantedAt) return;
    const csv = buildResultCsv(grantResults, grantedAt);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bulk_grant_result_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [grantResults, grantedAt]);

  const remainingChars = MAX_REASON_LENGTH - reason.length;
  const isReasonOverLimit = reason.length > MAX_REASON_LENGTH;
  const canGrant = rows.some((r) => r.status === "found");

  const duplicateEmails = (() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      counts.set(r.email, (counts.get(r.email) ?? 0) + 1);
    }
    return new Set(
      [...counts.entries()].filter(([, c]) => c > 1).map(([e]) => e)
    );
  })();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>CSVアップロード</Label>
        <p className="text-sm text-slate-600">
          フォーマット: email,amount（1行目はヘッダー可）。最大{MAX_ROWS}件。
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="max-w-xs"
          />
          <span className="text-sm text-slate-500">
            {rows.length > 0 ? `${rows.length}件読み込み済み` : ""}
          </span>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleLookup}
              disabled={isLookingUp}
            >
              {isLookingUp ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              登録確認
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadNotFound}
              disabled={notFoundRows.length === 0 || !lookupAt}
            >
              <Download className="mr-2 h-4 w-4" />
              登録なしリストダウンロード
            </Button>
          </div>

          <p className="text-sm text-slate-600">
            同じメールアドレスが複数ある場合、一括付与では各メールアドレスにつき最初の行の付与ペルコイン数のみが適用されます。重複行は「重複あり」列で確認できます。
          </p>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium">メール</th>
                  <th className="px-4 py-3 text-left font-medium">
                    付与ペルコイン数
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    元のペルコイン数
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    付与後ペルコイン数
                  </th>
                  <th className="px-4 py-3 text-left font-medium">ステータス</th>
                  <th className="px-4 py-3 text-left font-medium">重複あり</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={`${r.email}-${i}`}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-4 py-2 font-mono text-xs">{r.email}</td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min={1}
                        value={r.amount}
                        onChange={(e) =>
                          handleAmountChange(
                            i,
                            Math.max(1, parseInt(e.target.value, 10) || 1)
                          )
                        }
                        className="w-20"
                        disabled={isGranting}
                      />
                    </td>
                    <td className="px-4 py-2">
                      {r.balanceBefore !== null ? r.balanceBefore : "-"}
                    </td>
                    <td className="px-4 py-2">
                      {r.balanceBefore !== null
                        ? r.balanceBefore + r.amount
                        : "-"}
                    </td>
                    <td className="px-4 py-2">
                      {r.status === "pending" && "未確認"}
                      {r.status === "found" && "登録済み"}
                      {r.status === "not_found" && (
                        <span className="text-amber-600">登録なし</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {duplicateEmails.has(r.email) ? (
                        <Check className="h-4 w-4 text-slate-600" />
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <Label>
              付与種別 <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={balanceType}
              onValueChange={(v) => {
                if (isAdminPercoinBalanceType(v)) setBalanceType(v);
              }}
              className="gap-3"
            >
              {ADMIN_PERCOIN_BALANCE_TYPES.map((value) => (
                <div
                  key={value}
                  className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3"
                >
                  <RadioGroupItem
                    value={value}
                    id={`bulk-balance-type-${value}`}
                    className="mt-0.5"
                    disabled={isGranting}
                  />
                  <div className="space-y-1">
                    <Label
                      htmlFor={`bulk-balance-type-${value}`}
                      className="cursor-pointer text-sm font-medium"
                    >
                      {ADMIN_PERCOIN_BALANCE_TYPE_LABELS[value]}
                    </Label>
                    <p className="text-sm text-slate-600">
                      {ADMIN_PERCOIN_BALANCE_TYPE_DESCRIPTIONS[value]}
                    </p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-reason">
              付与理由 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="bulk-reason"
              placeholder="例: キャンペーン特典、補償対応など"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isGranting}
              rows={3}
              maxLength={MAX_REASON_LENGTH + 100}
              aria-invalid={!!errors.reason || isReasonOverLimit}
            />
            <div className="flex justify-between">
              {errors.reason && (
                <p className="text-sm text-destructive">{errors.reason}</p>
              )}
              <p
                className={`text-sm ml-auto ${
                  isReasonOverLimit ? "text-destructive" : "text-slate-600"
                }`}
              >
                {remainingChars}文字 / {MAX_REASON_LENGTH}文字
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="bulk-send-notification"
              checked={sendNotification}
              onCheckedChange={(c) => setSendNotification(c === true)}
              disabled={isGranting}
            />
            <Label
              htmlFor="bulk-send-notification"
              className="text-sm font-normal cursor-pointer"
            >
              通知を送信する
            </Label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleGrant}
              disabled={!canGrant || isGranting}
            >
              {isGranting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              一括付与を実行
            </Button>
            {grantResults && grantResults.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadResult}
              >
                <Download className="mr-2 h-4 w-4" />
                結果CSVをダウンロード
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
