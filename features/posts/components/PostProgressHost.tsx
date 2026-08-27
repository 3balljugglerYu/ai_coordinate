"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";
import { useUsageRewardAmounts } from "@/features/credits/hooks/useUsageRewardAmounts";
import {
  clearPostCompletion,
  getPostProgressServerSnapshot,
  getPostProgressSnapshot,
  subscribePostProgress,
} from "../lib/post-progress-store";
import { PostBonusModal } from "./PostBonusModal";
import { PostProgressBar } from "./PostProgressBar";

/**
 * 投稿の「送信中」と「完了」を受け持つ、アプリに1つだけのホスト。
 *
 * ## なぜ1か所にまとめるのか
 *
 * 以前は投稿が終わると `window.location.href = "/"` でホームへフル遷移し、
 * ホームが付与モーダルを出していた。遷移をやめると受け皿が無くなるが、
 * 投稿の入口は5か所ある(`/style` / 生成一覧 / 生成ギャラリー / 投稿詳細 /
 * 完走モーダル)。各画面に同じ後始末を書くと必ずズレるので、ここに集める。
 *
 * ## トーストと付与モーダルは**両方**出す
 *
 * 「付与があればモーダル、無ければトースト」と出し分けると、付与額の
 * 取得に失敗したときにどちらも出ない = **投稿できたことすら伝わらない**。
 * トーストは常に出し、もらえた回だけモーダルを重ねる。
 *
 * 重なりは問題にならない。トーストはスマホで画面上部・PCで右下
 * (`z-[100]`)、モーダルは中央(`z-50`)で、視覚的にぶつからない。
 *
 * ## マウント位置
 *
 * `LocaleShell` の Suspense 境界の**外側**に置くこと。AppShell 配下だと
 * `router.refresh()` などで Suspense が再活性化したときに unmount され、
 * 表示中のモーダルが消える(`CoordinateSourceStockSavePromptDialogHost` と
 * 同じ理由)。
 */
export function PostProgressHost() {
  const t = useTranslations("posts");
  /*
    還元額はここで引く。props で受けようとすると LocaleShell(サーバー)から
    渡すことになり、全ページの描画に1クエリぶら下がる。このフックは
    取得前・失敗時に 0 を返すので、「もらえないのに告知が出る」ことはない。
  */
  const { promptUsageRewardAmount } = useUsageRewardAmounts();
  const router = useRouter();
  const { toast } = useToast();

  const state = useSyncExternalStore(
    subscribePostProgress,
    getPostProgressSnapshot,
    getPostProgressServerSnapshot
  );

  /** 付与モーダルに出す内容。null なら出さない。 */
  const [bonus, setBonus] = useState<{
    amount: number;
    multiplier?: number;
    generationType: string | null;
    isPromptUse: boolean;
  } | null>(null);

  const openDetail = useCallback(
    (postId: string) => {
      router.push(`/posts/${encodeURIComponent(postId)}`);
    },
    [router]
  );

  const completed = state.completed;

  useEffect(() => {
    if (!completed) {
      return;
    }

    // 二重に処理しないよう、読み取ったらすぐ畳む
    clearPostCompletion();

    toast({
      title: t("postSuccess"),
      action: (
        /*
          ボタンには見せない。投稿の完了は**報告**で、押させたい操作では
          ないので、枠で主張させず下線のリンク調にとどめる。
          `ToastAction` の既定は枠付きボタンなので、そこだけ打ち消す。
        */
        <ToastAction
          altText={t("postSuccessViewAction")}
          onClick={() => openDetail(completed.id)}
          className="h-auto rounded-none border-0 bg-transparent px-0 font-medium text-sky-600 underline underline-offset-4 hover:bg-transparent hover:text-sky-700"
        >
          {t("postSuccessViewAction")}
        </ToastAction>
      ),
    });

    const postBonus = completed.bonus_granted ?? 0;
    const promptUseBonus = completed.prompt_use_bonus_granted ?? 0;
    const total = postBonus + promptUseBonus;
    if (total <= 0) {
      return;
    }

    /*
      倍率バッジは有料プランで倍率が付いたときだけ。無料プランに 1倍と
      出すと、あたかも増えているように読める。
    */
    const hasBoostedBonus =
      completed.subscription_plan &&
      completed.subscription_plan !== "free" &&
      typeof completed.bonus_multiplier === "number" &&
      completed.bonus_multiplier > 1;

    /*
      エフェクト内で同期に setState すると連鎖レンダーになる
      (`react-hooks/set-state-in-effect`)。解決済み Promise 経由で
      次のティックに回す(`useUsageRewardAmounts` と同じ作法)。

      ⭐ ここに「アンマウントしたら捨てる」ガードを付けないこと。
      直前の `clearPostCompletion()` で `completed` が null に変わり、
      **このエフェクト自身が作り直される**。クリーンアップでガードを
      倒すと、まだ出していない付与モーダルをそこで打ち消してしまう
      (実際にそれで出なくなり、テストで見つけた)。
      アンマウント後の setState は React 18 以降は何も起こさない。
    */
    void Promise.resolve().then(() => {
      setBonus({
        amount: total,
        multiplier: hasBoostedBonus ? completed.bonus_multiplier : undefined,
        generationType: completed.generation_type ?? null,
        isPromptUse: promptUseBonus > 0,
      });
    });
  }, [completed, openDetail, t, toast]);

  return (
    <>
      <PostProgressBar visible={state.submitting} />
      {bonus ? (
        <PostBonusModal
          open
          onOpenChange={(next) => {
            if (!next) {
              setBonus(null);
            }
          }}
          amount={bonus.amount}
          multiplier={bonus.multiplier}
          generationType={bonus.generationType}
          promptUsageRewardAmount={promptUsageRewardAmount}
          isPromptUse={bonus.isPromptUse}
        />
      ) : null}
    </>
  );
}
