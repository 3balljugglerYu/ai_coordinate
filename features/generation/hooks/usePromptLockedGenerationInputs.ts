"use client";

import { useEffect, useState } from "react";
import { fetchSourceNameInput } from "@/features/posts/lib/source-prompt-slots-api";
import { fetchSourcePromptText } from "@/features/posts/lib/source-prompt-text-api";
import type { NameInputForUsers } from "@/shared/generation/name-input";

/**
 * カタログから使う生成(派生生成)の入力面が、開いてから取りに行くもの。
 * パソコンのダイアログ(PromptLockedGenerationSheet)とスマホの生成画面
 * (PromptLockedGenerationScreen)で共有する。
 *
 * - 公開プロンプトの本文(表示だけ。生成に使う本文はサーバーが解決する)
 * - 名前の欄の見出しなど(本文は返らないので、非公開プロンプトでも出せる)
 */
export function usePromptLockedGenerationInputs({
  active,
  sourcePostId,
  promptVisibility,
}: {
  /** 開いている間だけ取りに行く。 */
  active: boolean;
  sourcePostId: string;
  promptVisibility: "public" | "private";
}) {
  const [lockedPromptText, setLockedPromptText] = useState<string | null>(null);

  /*
    公開プロンプトの本文は開いてから取りに行く。

    props へ載せると未フォロワーのブラウザにも届いてしまうため、
    サーバー側で認可する /api/posts/[id]/prompt-text 経由にする。
    取得に失敗しても生成自体は成立する（本文はサーバーが解決する）ので、
    表示だけ諦めて開いたままにする。
  */
  useEffect(() => {
    if (!active || promptVisibility !== "public") {
      return;
    }
    let cancelled = false;
    fetchSourcePromptText(sourcePostId)
      .then((text) => {
        if (!cancelled) setLockedPromptText(text);
      })
      .catch(() => {
        if (!cancelled) setLockedPromptText(null);
      });
    return () => {
      cancelled = true;
    };
  }, [active, promptVisibility, sourcePostId]);

  /*
    名前の欄(docs/planning/name-input-slot-plan.md Phase 3)。原作の本文に目印があれば、
    見出しなどだけを取りに行く。取れなくても生成はできる(目印は「名前なし」に置き換わる)。
  */
  // 取りに行った原作の ID と結果。原作が変わったら、前の原作の見出しを出さない
  const [nameInputState, setNameInputState] = useState<{
    postId: string;
    value: NameInputForUsers | null;
  } | null>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetchSourceNameInput(sourcePostId)
      .then((value) => {
        if (!cancelled) setNameInputState({ postId: sourcePostId, value });
      })
      .catch(() => {
        if (!cancelled) setNameInputState({ postId: sourcePostId, value: null });
      });
    return () => {
      cancelled = true;
    };
  }, [active, sourcePostId]);
  const nameInputLoaded = nameInputState?.postId === sourcePostId;

  return {
    lockedPromptText,
    lockedNameInput: nameInputLoaded ? nameInputState.value : null,
    // 取り終わるまでは生成させない(必須の名前を入れる前に送られないように)
    lockedNameInputLoading: active && !nameInputLoaded,
  };
}
