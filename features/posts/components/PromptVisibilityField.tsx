"use client";

import { useTranslations } from "next-intl";
import { Coins } from "lucide-react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useUsageRewardAmounts } from "@/features/credits/hooks/useUsageRewardAmounts";

export type PromptVisibilityValue = "public" | "private";

interface PromptVisibilityFieldProps {
  value: PromptVisibilityValue;
  onChange: (value: PromptVisibilityValue) => void;
  disabled?: boolean;
  /** 投稿モーダルと編集モーダルで id が衝突しないようにする接頭辞。 */
  idPrefix: string;
}

/**
 * プロンプトの公開設定。投稿モーダルと編集モーダルで共用する。
 *
 * ## なぜラジオ2択なのか
 *
 * チェックボックス1つだと「プロンプトを非公開にする」のチェックを外す＝
 * 「非公開にしないようにする」という二重否定になり、読み違えを招く。
 * どちらを選んでいるかが常に見えるラジオにした。
 *
 * ## なぜ既定が非公開なのか
 *
 * 非公開なら、使うたびに投稿者のところへ人が戻ってくる（生成は必ず
 * 「このプロンプトで作る」を通る）。公開だとコピーされた分はその輪から
 * 外れる。既定は最も強い誘導なので、投稿者に返るほうへ倒す。
 * 計画書 ADR-004 の改訂。
 *
 * ## 説明文について
 *
 * 選んだ側の説明だけを出す。両方を常に並べると読む量が増え、モバイルでは
 * 特に圧迫する。「コピーから作られた分は利用数に入りません」は事実で、
 * 利用イベントは `sourcePostId` を伴う生成にしか記録されない。コピーして
 * Free Style へ貼った場合は、アプリ内であっても原作との紐付けが無いため
 * 数えられない。
 */
export function PromptVisibilityField({
  value,
  onChange,
  disabled = false,
  idPrefix,
}: PromptVisibilityFieldProps) {
  const t = useTranslations("posts");
  // 還元が停止中(0)なら告知は出さない。取得前・失敗時も 0 なので、
  // 「もらえないのに告知だけ出る」ことはない。
  const { promptUsageRewardAmount } = useUsageRewardAmounts();
  const publicId = `${idPrefix}-prompt-visibility-public`;
  const privateId = `${idPrefix}-prompt-visibility-private`;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("promptVisibilityLabel")}</p>

      {promptUsageRewardAmount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-900">
          <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {t("promptVisibilityRewardHint", {
              amount: promptUsageRewardAmount,
            })}
          </span>
        </div>
      )}

      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(next as PromptVisibilityValue)}
        disabled={disabled}
        className="space-y-2"
      >
        {/*
          説明は選択肢の直下へ字下げして置く。モバイルでは横幅が狭く、
          ラジオの右へ回り込ませると2〜3行になって読みにくい。
        */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="private" id={privateId} />
            <Label htmlFor={privateId} className="cursor-pointer text-sm">
              {t("promptVisibilityPrivateOption")}
            </Label>
          </div>
          {value === "private" && (
            <p className="pl-6 text-xs leading-relaxed text-muted-foreground">
              {t("promptVisibilityPrivateHint")}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="public" id={publicId} />
            <Label htmlFor={publicId} className="cursor-pointer text-sm">
              {t("promptVisibilityPublicOption")}
            </Label>
          </div>
          {value === "public" && (
            <p className="pl-6 text-xs leading-relaxed text-muted-foreground">
              {t("promptVisibilityPublicHint")}
            </p>
          )}
        </div>
      </RadioGroup>
    </div>
  );
}
