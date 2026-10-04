"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { GACHA_SPLIT_PERCOIN_COST } from "@/shared/generation/gacha-split";

export interface GachaSplitToolProps {
  /** 今の本文。これを分ける。 */
  prompt: string;
  /** 今の候補欄（「元に戻す」で戻すために控える）。 */
  field: string;
  /** 本文と候補欄を書き換える。 */
  onApply: (body: string, field: string) => void;
  /**
   * 案を見せている間は true。呼び出し側は本文と候補欄を書き換えられないようにする
   * （案は押したときの本文から作ってあり、採用すると途中の書き換えが消えるため）。
   */
  onProposalOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}

interface Proposal {
  /** 分けたときの本文（消す行の印を付けて見せる）。 */
  original: string;
  body: string;
  field: string;
  removedLines: number[];
  candidateCount: number;
}

type ErrorKey =
  | "gachaSplitInsufficient"
  | "gachaSplitNotSplittable"
  | "gachaSplitFailed"
  // 返事が届かなかった。サーバーで引き落とし済みの可能性があるので「使っていない」と言わない
  | "gachaSplitConnectionLost";

function errorKeyFor(errorCode: unknown): ErrorKey {
  if (errorCode === "GACHA_SPLIT_INSUFFICIENT_BALANCE") return "gachaSplitInsufficient";
  if (errorCode === "GACHA_SPLIT_NOT_SPLITTABLE") return "gachaSplitNotSplittable";
  return "gachaSplitFailed";
}

/**
 * 「ガチャに分ける」道具（1回5ペルコイン。分けられたときだけ使う）。
 *
 * 押すと案を出すだけで、入力欄は書き換えない。消す行に印を付けた元の文と
 * 作られた候補欄を並べて見せ、「採用」で初めて書き換える。採用後は「元に戻す」で戻せる
 * （docs/planning/prompt-slots-implementation-plan.md ADR-003）。
 */
export function GachaSplitTool({
  prompt,
  field,
  onApply,
  onProposalOpenChange,
  disabled = false,
}: GachaSplitToolProps) {
  const t = useTranslations("free");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [undo, setUndo] = useState<{
    before: { body: string; field: string };
    applied: { body: string; field: string };
  } | null>(null);
  const hasPrompt = prompt.trim().length > 0;
  // 採用のあとに本文か候補欄を書き換えたら、元に戻すは出さない（書き換えを消してしまうため）
  const canUndo =
    undo !== null &&
    prompt === undo.applied.body &&
    field === undo.applied.field;

  // ガチャのチェックを外すなどで消えたら、本文の書き換え止めを解く
  useEffect(() => () => onProposalOpenChange?.(false), [onProposalOpenChange]);

  const showProposal = (next: Proposal | null) => {
    setProposal(next);
    onProposalOpenChange?.(next !== null);
  };

  const split = async () => {
    setPending(true);
    setErrorKey(null);
    setUndo(null);
    const original = prompt.trim();
    try {
      const response = await fetch("/api/gacha-prompt/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: original }),
      });
      const data = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (!response.ok) {
        setErrorKey(errorKeyFor(data?.errorCode));
        return;
      }
      if (!data || typeof data.body !== "string" || typeof data.field !== "string") {
        setErrorKey("gachaSplitConnectionLost");
        return;
      }
      showProposal({
        original,
        body: data.body,
        field: data.field,
        removedLines: Array.isArray(data.removedLines)
          ? data.removedLines.filter((n): n is number => typeof n === "number")
          : [],
        candidateCount: typeof data.candidateCount === "number" ? data.candidateCount : 0,
      });
      // 使ったペルコインを残高の表示へ反映する
      router.refresh();
    } catch {
      setErrorKey("gachaSplitConnectionLost");
    } finally {
      setPending(false);
    }
  };

  const accept = () => {
    if (!proposal) return;
    setUndo({
      before: { body: prompt, field },
      applied: { body: proposal.body, field: proposal.field },
    });
    onApply(proposal.body, proposal.field);
    showProposal(null);
  };

  const revert = () => {
    if (!canUndo || !undo) return;
    onApply(undo.before.body, undo.before.field);
    setUndo(null);
  };

  const removed = new Set(proposal?.removedLines ?? []);

  return (
    <div className="space-y-2 rounded-md bg-gray-50 p-3" data-testid="gacha-split-tool">
      <p className="text-xs text-gray-600">
        {t("gachaSplitDescription", { cost: GACHA_SPLIT_PERCOIN_COST })}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        pending={pending}
        disabled={disabled || !hasPrompt || proposal !== null}
        onClick={split}
      >
        {pending
          ? t("gachaSplitPending")
          : t("gachaSplitButton", { cost: GACHA_SPLIT_PERCOIN_COST })}
      </Button>

      {errorKey ? (
        <p className="text-xs text-red-600" role="alert" data-testid="gacha-split-error">
          {t(errorKey, { cost: GACHA_SPLIT_PERCOIN_COST })}
        </p>
      ) : null}

      {proposal ? (
        <div className="space-y-2" data-testid="gacha-split-proposal">
          <p className="text-sm font-medium">
            {t("gachaSplitProposalTitle", { count: proposal.candidateCount })}
          </p>
          <p className="text-xs text-gray-600">{t("gachaSplitProposalRemoved")}</p>
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded border bg-white p-2 font-mono text-xs">
            {proposal.original.split(/\r?\n/).map((line, index) =>
              removed.has(index + 1) ? (
                <del
                  key={index}
                  className="block bg-red-50 text-red-700"
                  data-testid="gacha-split-removed-line"
                >
                  {line || " "}
                </del>
              ) : (
                <span key={index} className="block">
                  {line || " "}
                </span>
              ),
            )}
          </pre>
          <p className="text-xs text-gray-600">{t("gachaSplitProposalField")}</p>
          <pre
            className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded border bg-white p-2 font-mono text-xs"
            data-testid="gacha-split-proposal-field"
          >
            {proposal.field}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={accept}>
              {t("gachaSplitAccept")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => showProposal(null)}
            >
              {t("gachaSplitCancel")}
            </Button>
          </div>
        </div>
      ) : null}

      {canUndo ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span role="status">{t("gachaSplitApplied")}</span>
          <Button type="button" size="sm" variant="ghost" onClick={revert}>
            {t("gachaSplitUndo")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
