"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { NameInputSlot } from "@/shared/generation/name-input";
import { NAME_INPUT_CREATE_PERCOIN_COST } from "@/shared/generation/name-input-create";

export interface NameInputCreateToolProps {
  /** 今の本文。これの名前に関する行をまとめる。 */
  prompt: string;
  /** 今の欄の設定(まとめた後の目印に使う)。 */
  slot: NameInputSlot;
  /** 本文を書き換える。 */
  onApply: (body: string) => void;
  /**
   * 作っている間と案を見せている間は true。呼び出し側は本文とスイッチを書き換えられないようにする
   * (案は押したときの本文から作ってあり、採用すると途中の書き換えが消えるため。
   * 作っている間にスイッチを切ると、ペルコインだけ使って案が消えるため)。
   */
  onProposalOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}

interface Proposal {
  /** 目印を外した元の本文(まとめる行に印を付けて見せる)。 */
  original: string;
  body: string;
  removedLines: number[];
  /** 一部を目印に置き換えた行(1始まり)。無ければ null。 */
  changedLine: number | null;
}

type ErrorKey =
  | "nameInputCreateInsufficient"
  | "nameInputCreateNotFound"
  // 本文にもう目印がある(道具は要らない)。ペルコインは使っていない
  | "nameInputCreateAlreadyExists"
  | "nameInputCreateFailed"
  // 返事が届かなかった。サーバーで引き落とし済みの可能性があるので「使っていない」と言わない
  | "nameInputCreateConnectionLost";

function errorKeyFor(errorCode: unknown): ErrorKey {
  if (errorCode === "NAME_INPUT_CREATE_INSUFFICIENT_BALANCE") return "nameInputCreateInsufficient";
  if (errorCode === "NAME_INPUT_CREATE_NOT_FOUND") return "nameInputCreateNotFound";
  if (errorCode === "NAME_INPUT_CREATE_ALREADY_EXISTS") return "nameInputCreateAlreadyExists";
  return "nameInputCreateFailed";
}

/**
 * 「本文から名前の欄を作る」道具(1回5ペルコイン。作れたときだけ使う)。
 *
 * 「ガチャに分ける」(GachaSplitTool)と同じ作り。押すと案を出すだけで、本文は書き換えない。
 * まとめる行に印を付けた元の文と、まとめた後の本文を並べて見せ、「採用」で初めて書き換える。
 * 採用後は「元に戻す」で戻せる。
 */
export function NameInputCreateTool({
  prompt,
  slot,
  onApply,
  onProposalOpenChange,
  disabled = false,
}: NameInputCreateToolProps) {
  const t = useTranslations("free");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [undo, setUndo] = useState<{ before: string; applied: string } | null>(null);
  // 目印しかない本文には、まとめる行が無い
  const hasPrompt = prompt.replace(/\{\{INPUT\*?:[^{}\r\n]*\}\}/g, "").trim().length > 0;
  // 採用のあとに本文を書き換えたら、元に戻すは出さない(書き換えを消してしまうため)
  const canUndo = undo !== null && prompt === undo.applied;

  // スイッチを切るなどで消えたら、本文の書き換え止めを解く
  useEffect(() => () => onProposalOpenChange?.(false), [onProposalOpenChange]);

  const showProposal = (next: Proposal | null) => {
    setProposal(next);
    onProposalOpenChange?.(next !== null);
  };

  const create = async () => {
    setPending(true);
    setErrorKey(null);
    setUndo(null);
    // 作っている間も本文とスイッチを止める(案が出なければ finally で解く)
    onProposalOpenChange?.(true);
    let proposalShown = false;
    try {
      const response = await fetch("/api/name-input/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, slot }),
      });
      const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        setErrorKey(errorKeyFor(data?.errorCode));
        return;
      }
      if (!data || typeof data.body !== "string" || typeof data.original !== "string") {
        setErrorKey("nameInputCreateConnectionLost");
        return;
      }
      proposalShown = true;
      showProposal({
        original: data.original,
        body: data.body,
        removedLines: Array.isArray(data.removedLines)
          ? data.removedLines.filter((n): n is number => typeof n === "number")
          : [],
        changedLine: typeof data.changedLine === "number" ? data.changedLine : null,
      });
      // 使ったペルコインを残高の表示へ反映する
      router.refresh();
    } catch {
      setErrorKey("nameInputCreateConnectionLost");
    } finally {
      setPending(false);
      if (!proposalShown) onProposalOpenChange?.(false);
    }
  };

  const accept = () => {
    if (!proposal) return;
    setUndo({ before: prompt, applied: proposal.body });
    onApply(proposal.body);
    showProposal(null);
  };

  const revert = () => {
    if (!canUndo || !undo) return;
    onApply(undo.before);
    setUndo(null);
  };

  const removed = new Set(proposal?.removedLines ?? []);
  const changedLine = proposal?.changedLine ?? null;

  return (
    <div className="space-y-2 rounded-md bg-gray-50 p-3" data-testid="name-input-create-tool">
      <p className="text-sm font-medium">{t("gachaSplitTitle")}</p>
      <p className="text-xs text-gray-600">
        {t("nameInputCreateDescription", { cost: NAME_INPUT_CREATE_PERCOIN_COST })}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        pending={pending}
        disabled={disabled || !hasPrompt || proposal !== null}
        onClick={create}
        // 文言が長い言語・狭い画面でも欄からはみ出さないよう、折り返して2行にする
        className="h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-left"
      >
        {pending
          ? t("nameInputCreatePending")
          : t("nameInputCreateButton", { cost: NAME_INPUT_CREATE_PERCOIN_COST })}
      </Button>

      {errorKey ? (
        <p className="text-xs text-red-600" role="alert" data-testid="name-input-create-error">
          {t(errorKey, { cost: NAME_INPUT_CREATE_PERCOIN_COST })}
        </p>
      ) : null}

      {proposal ? (
        <div className="space-y-2" data-testid="name-input-create-proposal">
          <p className="text-xs text-gray-600">{t("nameInputCreateProposalRemoved")}</p>
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded border bg-white p-2 font-mono text-xs">
            {proposal.original.split(/\r?\n/).map((line, index) =>
              removed.has(index + 1) ? (
                <del
                  key={index}
                  className="block bg-red-50 text-red-700"
                  data-testid="name-input-create-removed-line"
                >
                  {line || " "}
                </del>
              ) : index + 1 === changedLine ? (
                // 一部を文字入力の欄に置き換える行(行ごとは消さない)
                <mark
                  key={index}
                  className="block bg-amber-100 text-gray-900"
                  data-testid="name-input-create-changed-line"
                >
                  {line || " "}
                </mark>
              ) : (
                <span key={index} className="block">
                  {line || " "}
                </span>
              ),
            )}
          </pre>
          <p className="text-xs text-gray-600">{t("nameInputCreateProposalBody")}</p>
          <pre
            className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded border bg-white p-2 font-mono text-xs"
            data-testid="name-input-create-proposal-body"
          >
            {proposal.body}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={accept}>
              {t("gachaSplitAccept")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => showProposal(null)}>
              {t("gachaSplitCancel")}
            </Button>
          </div>
        </div>
      ) : null}

      {canUndo ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span role="status">{t("nameInputCreateApplied")}</span>
          <Button type="button" size="sm" variant="ghost" onClick={revert}>
            {t("gachaSplitUndo")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
