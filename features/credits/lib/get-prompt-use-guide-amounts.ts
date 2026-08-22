import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getPercoinDefaultsForDisplay } from "./get-percoin-defaults";

/**
 * `/use-prompts`(プロンプト利用ミッションの紹介ページ)が表示する3つの額。
 *
 * **文言に数字を埋め込まないため**にサーバーで読む。運営が
 * `/admin/percoin-defaults` で変えたら、ページの表示もそのまま追従する。
 *
 * すべて素の設定値で、サブスク倍率は掛けない。プランごとの実額は
 * ミッション画面が持っている(紹介ページで倍率まで出すと、
 * 「ページに書いてある額と違う」がプラン間で発生する)。
 */
export interface PromptUseGuideAmounts {
  /** 他の人のプロンプトで作った作品を投稿したときの付与額。0 = 停止中。 */
  promptUseBonusAmount: number;
  /**
   * 自分で書いたプロンプトで作った作品を投稿したときの付与額。
   * 「1投稿はどちらか一方」を説明するために並べて出す。
   */
  freePostBonusAmount: number;
  /** 使われた側(原作者)に入る還元額。0 なら還元の案内を出さない。 */
  creatorRewardAmount: number;
}

const EMPTY_AMOUNTS: PromptUseGuideAmounts = {
  promptUseBonusAmount: 0,
  freePostBonusAmount: 0,
  creatorRewardAmount: 0,
};

/** 数値でなければ 0 に倒す(RPC が null / 想定外の型を返した場合)。 */
function toAmount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/**
 * 紹介ページ用の額をまとめて取得する。
 *
 * **取得に失敗したら 0 に倒す(fail closed)。** 0 は「停止中」の意味で、
 * ページ側は非運営に 404 を返す。取得失敗を「もらえます」の表示にしない。
 *
 * 付与額の RPC は 2 つとも `anon` に GRANT 済みなので、ページの
 * クライアント(cookie ベース)からそのまま呼べる。マイグレーションは不要。
 */
export const getPromptUseGuideAmounts = cache(
  async (): Promise<PromptUseGuideAmounts> => {
    const supabase = await createClient();

    /*
      `supabase.rpc()` が返すビルダーは `then` しか持たない(PromiseLike)。
      `.catch()` は生えていないので、Promise.resolve で包んでから捕まえる。
    */
    const [promptUseResult, postBonusResult, defaults] = await Promise.all([
      Promise.resolve(supabase.rpc("get_prompt_use_bonus_amount")).catch(
        () => null
      ),
      Promise.resolve(supabase.rpc("get_post_bonus_amounts")).catch(() => null),
      // 還元額だけは admin クライアント経由(percoin_bonus_defaults は
      // anon から読めない)。失敗しても他の2つを道連れにしない。
      getPercoinDefaultsForDisplay("free").catch(() => null),
    ]);

    if (promptUseResult?.error) {
      console.error(
        "Failed to fetch prompt use bonus amount",
        promptUseResult.error
      );
    }
    if (postBonusResult?.error) {
      console.error(
        "Failed to fetch post bonus amounts",
        postBonusResult.error
      );
    }

    const postBonusAmounts =
      (postBonusResult?.data as Record<string, unknown> | null) ?? null;

    return {
      ...EMPTY_AMOUNTS,
      promptUseBonusAmount: toAmount(promptUseResult?.data),
      freePostBonusAmount: toAmount(postBonusAmounts?.free),
      creatorRewardAmount: toAmount(defaults?.promptUsageRewardAmount),
    };
  }
);
