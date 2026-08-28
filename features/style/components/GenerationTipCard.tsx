"use client";

import { Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * 生成画面のワンポイントアドバイス。
 *
 * 運営が企画やスタイルごとに一言だけ添えるための場所。設定が無ければ何も出さない。
 *
 * 置き場所は「うちの子カード」と「生成モデルのカード」の間。生成の操作についての
 * 助言なので、選択肢の手前で目に入る必要がある。既存の ⓘ ツールチップのように
 * 畳んでしまうと、読まれないまま生成されて意味がなくなる。
 */
export function GenerationTipCard({ tip, label }: { tip: string; label: string }) {
  return (
    <Card className="border-amber-200 bg-amber-50/70 p-4">
      <div className="flex gap-3">
        <Lightbulb
          className="mt-0.5 h-5 w-5 shrink-0 text-amber-500"
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-amber-900">{label}</p>
          {/* 運営が改行で書き分けられるようにする */}
          <p className="whitespace-pre-line text-sm leading-6 text-amber-900/90">
            {tip}
          </p>
        </div>
      </div>
    </Card>
  );
}
