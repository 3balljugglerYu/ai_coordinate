"use client";

import { useEffect, useState } from "react";
import { preload } from "react-dom";
import Image, { getImageProps } from "next/image";
import Link from "next/link";
import percoinIcon from "@/public/percoin.png";
import { useTranslations } from "next-intl";
import { fetchPercoinBalance } from "@/features/credits/lib/api";
import {
  getPercoinPurchaseUrl,
  type PercoinPurchaseReferrer,
} from "@/features/credits/lib/urls";

/**
 * 残高の行のコインのアイコン(読み込み中も枠を出す showBalancePlaceholder のとき)。
 *
 * 文字列の "/percoin.png" を最適化して使うと、本番(Vercel)でも
 * `Cache-Control: max-age=0` で返り、開くたびにブラウザが確認し直すため、
 * アイコンだけ遅れて出ることがあった(2026-09-26 実測)。
 * import して最適化せずに(unoptimized)使うと、
 *  - `/_next/static/media/percoin.<hash>.png` から配信され、本番では
 *    `max-age=31536000, immutable` でキャッシュされる(同じ経路のファイルで実測)
 *  - ぼかした小さな代わりの画像(blurDataURL)がビルド時に埋め込まれ、
 *    画像が届く前から空白にならない(placeholder="blur")
 * 9.7KB の小さなアイコンなので最適化の利点は無い(Vercel も 10KB 未満は
 * unoptimized を推奨している)。先読み(preloadPercoinIcon)と表示で同じ値を使う。
 */
const PERCOIN_ICON = {
  src: percoinIcon,
  width: 40,
  height: 40,
  unoptimized: true,
} as const;

/**
 * 残高の行のコインのアイコンを先に読み込んでおく。
 *
 * シートを開いてから読み始めると、枠を先に出してもアイコンだけ遅れて出る。
 * シートを開ける画面(/styles の刷新後・ログイン中)で呼んでおけば、開いた瞬間に出る。
 * next/image が実際に使う URL と揃えるため getImageProps で組み立てる。
 */
export function preloadPercoinIcon() {
  const { props } = getImageProps({ ...PERCOIN_ICON, alt: "" });
  preload(props.src, {
    as: "image",
    imageSrcSet: props.srcSet,
    imageSizes: props.sizes,
    fetchPriority: "low",
  });
}

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
 *
 * `/styles` の生成シート(One-Tap Style)でも使う。そのときは `mode="style"` で
 * One-Tap Style の見出し・説明と、購入ページからの戻り先を切り替える。
 */
export function PromptLockedGenerationHeader({
  mode = "free",
  showBalancePlaceholder = false,
}: {
  /** どの生成の見出しか。既定は Free Style(User ORIGINAL の生成シート)。 */
  mode?: Extract<PercoinPurchaseReferrer, "free" | "style">;
  /**
   * 残高を読み込む前から枠とアイコンを出し、数は「-」にする。
   * 取れてから枠を差し込むと、下の内容が押し下げられて段差が出るため。
   * 取得に失敗したときも「-」のまま枠を残す。
   * (/styles の生成シートで使う。既定は従来どおり、取れたときだけ出す)
   */
  showBalancePlaceholder?: boolean;
} = {}) {
  const freeT = useTranslations("free");
  const styleT = useTranslations("style");
  const t = mode === "style" ? styleT : freeT;
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

      {balance !== null || showBalancePlaceholder ? (
        <Link
          href={getPercoinPurchaseUrl(mode)}
          className="inline-flex w-fit items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 transition-opacity hover:opacity-80"
          aria-busy={balance === null ? true : undefined}
        >
          {showBalancePlaceholder ? (
            <Image
              {...PERCOIN_ICON}
              alt={creditsT("percoinUnit")}
              className="h-10 w-10"
              // シートの先頭にあるので最初から読む(下からせり上がる間に後回しにしない)
              loading="eager"
              placeholder="blur"
            />
          ) : (
            <Image
              src="/percoin.png"
              alt={creditsT("percoinUnit")}
              width={40}
              height={40}
              className="h-10 w-10"
            />
          )}
          <span className="flex flex-col">
            <span className="text-xs text-gray-500">
              {creditsT("balanceLabel")}
            </span>
            <span className="text-lg font-bold text-gray-900">
              {balance !== null ? new Intl.NumberFormat().format(balance) : "-"}{" "}
              {creditsT("percoinUnit")}
            </span>
          </span>
        </Link>
      ) : null}
    </div>
  );
}
