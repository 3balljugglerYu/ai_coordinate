import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * 「プロンプトオプション」の箱。名前の欄とガチャのスイッチを1行ずつ並べる
 * (docs/planning/name-input-slot-plan.md ADR-4。あとで仕掛けが増えても、ここに1行足すだけで済む)。
 */
export function PromptGimmicksBox({ children }: { children: ReactNode }) {
  const t = useTranslations("free");
  return (
    <section
      aria-labelledby="prompt-gimmicks-title"
      className="space-y-4 rounded-xl border border-gray-200 p-3"
      data-testid="prompt-gimmicks-box"
    >
      <h3 id="prompt-gimmicks-title" className="text-xs font-medium text-gray-500">
        {t("promptGimmicksTitle")}
      </h3>
      {children}
    </section>
  );
}
