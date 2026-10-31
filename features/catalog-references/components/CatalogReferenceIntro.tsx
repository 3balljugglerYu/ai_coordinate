"use client";

import { useState, useSyncExternalStore } from "react";
import {
  hasSeenCatalogReferenceIntro,
  markCatalogReferenceIntroSeen,
  subscribeCatalogReferenceFlags,
} from "@/features/catalog-references/lib/local-flags";
import { CatalogReferenceIntroSheet } from "./CatalogReferenceIntroSheet";

interface CatalogReferenceIntroProps {
  /** 本人の ID(見た印を、本人ごとに分けて端末に残す) */
  userId: string;
  /** 一度でも同意したことがあるか。あれば出さない */
  consentedBefore: boolean;
  /** 「ためしてみる」を押した(「イラストから」のタブへ移る) */
  onTry: () => void;
}

/**
 * 見本を使える人に、最初の1回だけ出す「先行公開」の案内(第2案)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md §10
 *
 * - 一度も同意したことが無く、まだ見ていない人にだけ出す(SSR では出さない。ほかのタブで見たら閉じる)
 * - 閉じても「ためしてみる」でも、見た印を残す。「ためしてみる」は「イラストから」のタブへ移る
 */
export function CatalogReferenceIntro({ userId, consentedBefore, onTry }: CatalogReferenceIntroProps) {
  const eligible = useSyncExternalStore(
    subscribeCatalogReferenceFlags,
    () => !consentedBefore && !hasSeenCatalogReferenceIntro(userId),
    () => false,
  );
  const [dismissed, setDismissed] = useState(false);

  const close = () => {
    markCatalogReferenceIntroSeen(userId);
    setDismissed(true);
  };

  return (
    <CatalogReferenceIntroSheet
      open={eligible && !dismissed}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      onTry={() => {
        close();
        onTry();
      }}
    />
  );
}
