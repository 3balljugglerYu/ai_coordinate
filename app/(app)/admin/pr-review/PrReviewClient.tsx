"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Clipboard,
  Loader2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Severity = "high" | "medium" | "low";

interface ReviewFinding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  path: string;
  line: number | null;
}

interface ReviewResponse {
  repository: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  summary: string;
  findings: ReviewFinding[];
  meta: {
    changedFiles: number;
    reviewedFiles: number;
    truncatedByFileLimit: boolean;
    truncatedByPromptSize: boolean;
  };
}

function getSeverityStyle(severity: Severity) {
  switch (severity) {
    case "high":
      return "bg-red-100 text-red-800 border-red-200";
    case "medium":
      return "bg-amber-100 text-amber-800 border-amber-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function buildCursorPrompt(result: ReviewResponse, finding: ReviewFinding) {
  return [
    "GitHub PRレビューの指摘に対する修正をお願いします。",
    `Repository: ${result.repository}`,
    `PR: #${result.prNumber} ${result.prTitle}`,
    `対象箇所: ${finding.path}${finding.line ? `:${finding.line}` : ""}`,
    `指摘タイトル: ${finding.title}`,
    `指摘詳細: ${finding.detail}`,
    "原因を分析し、最小差分で修正してください。必要なら関連箇所も合わせて修正してください。",
  ].join("\n");
}

export function PrReviewClient() {
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [prNumber, setPrNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResponse | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const pr = Number(prNumber);
    return owner.trim().length > 0 && repo.trim().length > 0 && Number.isInteger(pr) && pr > 0;
  }, [owner, repo, prNumber]);

  const handleReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setActionMessage(null);

    try {
      const response = await fetch("/api/admin/github/pr-review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          owner: owner.trim(),
          repo: repo.trim(),
          prNumber: Number(prNumber),
        }),
      });

      const data = (await response.json()) as ReviewResponse | { error?: string };
      if (!response.ok) {
        throw new Error((data as { error?: string }).error ?? "レビューに失敗しました");
      }

      setResult(data as ReviewResponse);
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "レビューに失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSendToCursor = async (finding: ReviewFinding) => {
    if (!result) return;

    const prompt = buildCursorPrompt(result, finding);
    const deeplink = `cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(prompt)}`;
    let copied = false;

    try {
      await navigator.clipboard.writeText(prompt);
      copied = true;
    } catch {
      copied = false;
    }

    window.location.href = deeplink;
    setActionMessage(
      copied
        ? "Cursor deeplinkを起動し、同内容をクリップボードにもコピーしました。"
        : "Cursor deeplinkを起動しました（クリップボードコピーは失敗）。"
    );
  };

  const handleCopyOnly = async (finding: ReviewFinding) => {
    if (!result) return;
    const prompt = buildCursorPrompt(result, finding);
    await navigator.clipboard.writeText(prompt);
    setActionMessage("指摘内容をクリップボードにコピーしました。");
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6">
          <form className="space-y-4" onSubmit={handleReview}>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="github-owner">GitHub Owner</Label>
                <Input
                  id="github-owner"
                  value={owner}
                  onChange={(event) => setOwner(event.target.value)}
                  placeholder="example: vercel"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="github-repo">Repository</Label>
                <Input
                  id="github-repo"
                  value={repo}
                  onChange={(event) => setRepo(event.target.value)}
                  placeholder="example: next.js"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="github-pr-number">PR番号</Label>
                <Input
                  id="github-pr-number"
                  type="number"
                  min={1}
                  step={1}
                  value={prNumber}
                  onChange={(event) => setPrNumber(event.target.value)}
                  placeholder="example: 1234"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={!canSubmit || loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    レビュー実行中...
                  </>
                ) : (
                  "PRレビューを実行"
                )}
              </Button>
              <p className="text-xs text-slate-500">
                実行には `GEMINI_API_KEY` が必要です。`GITHUB_TOKEN` はレート制限回避のため推奨です。
              </p>
            </div>
          </form>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {actionMessage && (
            <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-700">
              {actionMessage}
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
          <CardContent className="space-y-5 p-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  レビュー結果: {result.repository} #{result.prNumber}
                </h2>
                <a
                  href={result.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-violet-700 hover:underline"
                >
                  PRを開く
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </div>
              <p className="text-sm text-slate-600">{result.prTitle}</p>
              <p className="text-sm text-slate-700">{result.summary || "要約なし"}</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              変更ファイル {result.meta.changedFiles} 件中 {result.meta.reviewedFiles} 件をレビュー
              {result.meta.truncatedByFileLimit && "（ファイル数上限で一部省略）"}
              {result.meta.truncatedByPromptSize && "（差分サイズ上限で一部省略）"}
            </div>

            {result.findings.length === 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                重大な指摘は見つかりませんでした。
              </div>
            ) : (
              <ul className="space-y-3">
                {result.findings.map((finding) => (
                  <li
                    key={finding.id}
                    className="rounded-lg border border-slate-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${getSeverityStyle(
                              finding.severity
                            )}`}
                          >
                            {finding.severity.toUpperCase()}
                          </span>
                          <span className="font-semibold text-slate-900">
                            {finding.title}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700">{finding.detail}</p>
                        <p className="text-xs text-slate-500">
                          {finding.path}
                          {finding.line ? `:${finding.line}` : ""}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleSendToCursor(finding)}
                        >
                          <Send className="mr-1.5 h-4 w-4" />
                          Cursorへ入力
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyOnly(finding)}
                        >
                          <Clipboard className="mr-1.5 h-4 w-4" />
                          コピーのみ
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          deeplinkはCursorの入力欄をプリフィルしますが、実行は自動では行われません。Cursor側で内容確認後に送信してください。
        </p>
      </div>
    </div>
  );
}
