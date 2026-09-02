"use client";

import { useTranslations } from "next-intl";

/**
 * 🔥人気タブの新着枠に差し込まれた投稿に付く 🆕 ラベル。
 *
 * ⭐ お着替えプリセットの NEW バッジ（`styleNewBadge`・登録 14 日以内）とは
 * **別物**なので、定数も文言キーも共有しない。こちらは「直近 24 時間の投稿から
 * 選ばれた上位 3 件」で、窓も選び方も意味が違う。判定の正本は DB 側
 * （`popular_prompt_rankings.is_new`）で、ここは描くだけ。
 *
 * 位置は持たない。カード側の「左上の器」（完走バッジと同じ flex 行）に入れる。
 * 以前は一覧のラッパーに絶対配置していたが、フィードカードでは**作者アイコンに
 * 重なっていた**（実機で確認）。四隅は既に用途が決まっている
 * （左上=完走 / 右上=三点リーダー / 左下=生成モード / 右下=Before）。
 */
export function NewPromptBadge() {
  const postsT = useTranslations("posts");

  return (
    <span className="pointer-events-none inline-flex items-center rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-2 py-0.5 text-[11px] font-bold leading-tight text-white shadow">
      {postsT("popularPromptsNewBadge")}
    </span>
  );
}
