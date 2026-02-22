"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AuditLogEntry {
  id: string;
  admin_user_id: string;
  admin_nickname?: string | null;
  action_type: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, string> = {
  user_suspend: "ユーザー停止",
  user_reactivate: "ユーザー復帰",
  bonus_grant: "ボーナス付与",
  moderation_approve: "審査: 問題なし",
  moderation_reject: "審査: 不適切",
};

const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "__all__", label: "すべて" },
  ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
];

const TARGET_OPTIONS: { value: string; label: string }[] = [
  { value: "__all__", label: "すべて" },
  { value: "user", label: "ユーザー" },
  { value: "post", label: "投稿" },
];

export function AuditLogClient() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  const [actionType, setActionType] = useState("__all__");
  const [targetType, setTargetType] = useState("__all__");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchLogs = useCallback(
    async (off: number) => {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(off));
      if (actionType && actionType !== "__all__") params.set("action_type", actionType);
      if (targetType && targetType !== "__all__") params.set("target_type", targetType);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);

      try {
        const res = await fetch(`/api/admin/audit-log?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "取得に失敗しました");
        setLogs(data.logs || []);
        setTotal(data.total ?? 0);
        setOffset(off);
      } catch (err) {
        console.error(err);
        setLogs([]);
      } finally {
        setLoading(false);
      }
    },
    [actionType, targetType, dateFrom, dateTo]
  );

  useEffect(() => {
    fetchLogs(0);
  }, [fetchLogs]);

  const handleApplyFilter = () => {
    fetchLogs(0);
  };

  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
      <CardContent className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <FileText className="h-5 w-5 text-violet-600" />
            操作履歴
            <span className="text-sm font-normal text-slate-500">
              （全{total}件）
            </span>
          </h2>
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <a
              href={`/api/admin/audit-log?format=csv${actionType && actionType !== "__all__" ? `&action_type=${encodeURIComponent(actionType)}` : ""}${targetType && targetType !== "__all__" ? `&target_type=${encodeURIComponent(targetType)}` : ""}${dateFrom ? `&date_from=${encodeURIComponent(dateFrom)}` : ""}${dateTo ? `&date_to=${encodeURIComponent(dateTo)}` : ""}`}
              download="admin-audit-log.csv"
            >
              <Download className="mr-1 h-4 w-4" />
              CSV エクスポート
            </a>
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200/80 bg-slate-50/50 p-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">フィルター</span>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">
                アクション種別
              </label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="すべて" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">
                対象タイプ
              </label>
              <Select value={targetType} onValueChange={setTargetType}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="すべて" />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">
                日付（から）
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">
                日付（まで）
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleApplyFilter}>
              適用
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-600">
            操作ログがありません。（フィルター条件を変更するか、マイグレーション適用後は記録が開始されます）
          </p>
        ) : (
          <>
            <ul className="space-y-3">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="font-medium text-slate-900">
                        {ACTION_LABELS[log.action_type] || log.action_type}
                      </span>
                      {log.target_type === "user" && log.target_id && (
                        <Link
                          href={`/admin/users/${log.target_id}`}
                          className="ml-2 text-sm text-violet-600 hover:underline"
                        >
                          {log.target_id.slice(0, 8)}...
                        </Link>
                      )}
                      {log.target_type === "post" && log.target_id && (
                        <Link
                          href={`/posts/${log.target_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-sm text-violet-600 hover:underline"
                        >
                          投稿 {log.target_id.slice(0, 8)}...
                        </Link>
                      )}
                    </div>
                    <div className="text-right">
                      {log.admin_nickname && (
                        <p className="text-xs text-slate-600">
                          管理者: {log.admin_nickname}
                        </p>
                      )}
                      <span className="text-xs text-slate-500">
                        {new Date(log.created_at).toLocaleString("ja-JP")}
                      </span>
                    </div>
                  </div>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-2 text-xs text-slate-700">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchLogs(offset - PAGE_SIZE)}
                disabled={!hasPrev || loading}
              >
                <ChevronLeft className="h-4 w-4" />
                前へ
              </Button>
              <span className="text-sm text-slate-600">
                {offset + 1} - {Math.min(offset + PAGE_SIZE, total)} / {total}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchLogs(offset + PAGE_SIZE)}
                disabled={!hasNext || loading}
              >
                次へ
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
