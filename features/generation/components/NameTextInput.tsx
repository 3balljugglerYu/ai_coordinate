"use client";

import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NAME_INPUT_MAX_LENGTH } from "@/shared/generation/name-input";

type NameTextInputProps = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/**
 * 名前の入力欄。上限(8文字)を超えた分を、打っている時点で赤くする(2026-10-07 ユーザー指示)。
 *
 * input の文字は色を付け分けられないので、超えたときだけ input の文字を透明にし、
 * 同じ位置に「上限まで(黒)+超えた分(赤)」の文を重ねて見せる(カーソルと選択は input のまま)。
 * 文字数は見た目の1文字(コードポイント)で数える(checkNameInputValue と同じ)。
 */
export function NameTextInput({ value, onValueChange, className, ...props }: NameTextInputProps) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const characters = [...value];
  const overflow = characters.length > NAME_INPUT_MAX_LENGTH;
  // 欄より長いときに input が横へ流れた分を、重ねた文にも合わせる
  const syncScroll = (input: HTMLInputElement) => {
    if (mirrorRef.current) mirrorRef.current.scrollLeft = input.scrollLeft;
  };

  return (
    <div className="relative">
      <Input
        {...props}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          syncScroll(event.target);
        }}
        onScroll={(event) => syncScroll(event.currentTarget)}
        onSelect={(event) => syncScroll(event.currentTarget)}
        className={cn("text-base md:text-sm", overflow && "text-transparent caret-gray-900", className)}
      />
      {overflow ? (
        <div
          ref={mirrorRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre rounded-md border border-transparent px-3 text-base md:text-sm"
          data-testid="name-text-overflow"
        >
          <span className="shrink-0">{characters.slice(0, NAME_INPUT_MAX_LENGTH).join("")}</span>
          <span className="shrink-0 text-red-600" data-testid="name-text-overflow-excess">
            {characters.slice(NAME_INPUT_MAX_LENGTH).join("")}
          </span>
        </div>
      ) : null}
    </div>
  );
}
