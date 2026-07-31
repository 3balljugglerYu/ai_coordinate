"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { fetchPercoinBalance } from "@/features/credits/lib/api";
import { getPercoinPurchaseUrl } from "@/features/credits/lib/urls";

/**
 * 派生生成の入力面の見出し。
 *
 * `/free` のページ冒頭（タイトル・説明・保有ペルコイン）と同じ並びにする。
 * 中でやっていることは Free Style の生成そのものなので、見出しだけ
 * 「このプロンプトで作る」にすると別機能に見えてしまう。
 *
 * ペルコイン残高はサーバーコンポーネント (CachedGenerationPercoinBalance) を
 * 使えないため、`/api/credits/balance` から取る。取得できないときは残高の行
 * だけ出さない。残高が読めなくても生成の導線自体は成立するので、ここで
 * シートを止めない。
 */
export function PromptLockedGenerationHeader() {
  const t = useTranslations("free");
  const creditsT = useTranslations("credits");
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPercoinBalance({ fetchBalanceFailed: creditsT("fetchBalanceFailed") })
      .then((result) => {
        if (!cancelled) setBalance(result.balance);
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [creditsT]);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("pageDescription")}
        </p>
      </div>

      {balance !== null ? (
        <Link
          href={getPercoinPurchaseUrl("free")}
          className="inline-flex w-fit items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 transition-opacity hover:opacity-80"
        >
          <Image
            src="/percoin.png"
            alt={creditsT("percoinUnit")}
            width={40}
            height={40}
            className="h-10 w-10"
          />
          <span className="flex flex-col">
            <span className="text-xs text-gray-500">
              {creditsT("balanceLabel")}
            </span>
            <span className="text-lg font-bold text-gray-900">
              {new Intl.NumberFormat().format(balance)} {creditsT("percoinUnit")}
            </span>
          </span>
        </Link>
      ) : null}
    </div>
  );
}
