"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * /creators/submit 用の軽量トップバー。
 * 共通 chrome をバイパスしている(下部ナビ等なし)ため、戻る導線をここで提供する。
 * 戻るは前回の画面へ(履歴があれば router.back、無ければ /creators へフォールバック)。
 */
export function CreatorSubmitTopBar() {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/creators");
    }
  };

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-white/90 px-3 py-2.5 backdrop-blur">
      <button
        type="button"
        onClick={handleBack}
        aria-label="戻る"
        className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <span className="text-sm font-medium text-gray-800">
        プロンプトを提供する
      </span>
    </header>
  );
}
