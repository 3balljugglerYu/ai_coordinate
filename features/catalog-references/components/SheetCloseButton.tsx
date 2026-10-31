"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";

/** 見本のシートを閉じるボタン(押せる広さ 44px・読み上げは各言語の文言) */
export function SheetCloseButton({ label }: { label: string }) {
  return (
    <SheetClose asChild>
      <Button type="button" variant="ghost" size="icon" className="-mr-2 -mt-2 h-11 w-11 flex-none" aria-label={label}>
        <X className="h-5 w-5" />
      </Button>
    </SheetClose>
  );
}
