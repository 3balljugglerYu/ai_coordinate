"use client";

import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";

interface AdminCsvExportButtonsProps {
  csv: string;
  filename: string;
}

/**
 * CSV 文字列を「ワンタップでコピー」「ダウンロード」する共通ボタン。
 * server / client いずれの親からも利用可(csv は文字列で受け取る)。
 */
export function AdminCsvExportButtons({
  csv,
  filename,
}: AdminCsvExportButtonsProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard
      .writeText(csv)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // クリップボードが使えない環境(非secure context 等)は黙って無視
      });
  }

  function handleDownload() {
    // 先頭に BOM を付け、Excel で UTF-8(日本語)が文字化けしないようにする
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        )}
        {copied ? "コピーしました" : "CSVをコピー"}
      </button>
      <button
        type="button"
        onClick={handleDownload}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        CSVダウンロード
      </button>
    </div>
  );
}
