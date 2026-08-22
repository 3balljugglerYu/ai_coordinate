"use client";

import { useEffect, useState } from "react";
import { Home, Check } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

/**
 * 完走をホームフィードに投稿する(オプトイン)ボタン。
 * - 完走モーダル(variant="cta": 全幅ピル)と没入シェアページ(variant="chrome": 小型)で再利用。
 * - 機能フラグ NEXT_PUBLIC_COLLECTION_FEED_POST_ENABLED が 'true' のときだけ描画(OFFは null)。
 * - マウント時に投稿済みかを取得し、未投稿=「ホームに投稿する」/ 投稿済み=「投稿済み ✓ + 取り消す」。
 * - 所有権・冪等性はサーバ(RPC/RLS)が担保するため、本コンポーネントは状態表示と送信のみ。
 *
 * ## ⭐ 取得中も同じ高さの場所を確保すること
 *
 * かつては取得が終わるまで `null` を返していた。その結果、完走モーダルでは
 * **このボタンだけ数百ms遅れて出現し、下にある「シェアする」「カードを更新する」を
 * 68px ぶん押し下げていた**(ピル52px + 親の space-y-4 の16px)。
 * ちょうどボタン1個ぶんずれるので、押した瞬間に別のボタンが滑り込んで
 * **意図しない方が押される**(実機で報告された)。
 *
 * 取得中はスケルトンを描いて場所を先に取る。こうすると
 * **他のボタンは最初から最後まで一切動かない**。
 */
const ENABLED =
  process.env.NEXT_PUBLIC_COLLECTION_FEED_POST_ENABLED === "true";

export function CompletionFeedPostButton({
  completionId,
  displayName,
  variant = "cta",
}: {
  completionId: string;
  displayName?: string;
  variant?: "cta" | "chrome";
}) {
  const [posted, setPosted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [caption, setCaption] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (!ENABLED) return;
    let cancelled = false;
    fetch(`/api/collections/completions/${completionId}/post`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { posted: false }))
      .then((d: { posted?: boolean }) => {
        if (!cancelled) setPosted(Boolean(d.posted));
      })
      .catch(() => {
        if (!cancelled) setPosted(false);
      });
    return () => {
      cancelled = true;
    };
  }, [completionId]);

  if (!ENABLED) return null;

  const isChromeVariant = variant === "chrome";

  /*
    取得中。**中身は空でも箱は本番と同じ寸法にする**(下のボタンを動かさない)。
    押せると誤解させないよう、ボタンではなく淡いスケルトンとして描く。
  */
  if (posted === null) {
    return (
      <div
        aria-hidden
        className={
          isChromeVariant
            ? "inline-flex animate-pulse items-center gap-1.5 rounded-full bg-stone-200/70 px-3 py-2 text-sm font-bold text-transparent shadow-md"
            : "flex w-full animate-pulse items-center justify-center gap-2 rounded-full border-2 border-stone-200 bg-stone-100 px-6 py-3 text-base font-bold text-transparent"
        }
      >
        {/* 文字は透明。高さを本番と揃えるためだけに置く */}
        <span className="h-4 w-4" />
        ホームに投稿する
      </div>
    );
  }

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/collections/completions/${completionId}/post`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caption: caption.trim() || undefined }),
        },
      );
      if (res.ok) {
        setPosted(true);
        setExpanded(false);
        toast({ title: "ホームに投稿しました" });
      } else {
        toast({
          variant: "destructive",
        title: "投稿に失敗しました。時間をおいて再度お試しください。",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "通信に失敗しました。電波の良い場所でお試しください。",
      });
    } finally {
      setBusy(false);
    }
  }

  async function cancelPost() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/collections/completions/${completionId}/post`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setPosted(false);
      } else {
        toast({
          variant: "destructive",
        title: "取り消しに失敗しました。時間をおいて再度お試しください。",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "通信に失敗しました。電波の良い場所でお試しください。",
      });
    } finally {
      setBusy(false);
    }
  }


  // 投稿済み表示
  if (posted) {
    return (
      <div
        className={
          isChromeVariant
            ? "inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-2 text-sm font-bold text-emerald-600 shadow-md"
            : "flex w-full items-center justify-center gap-2 rounded-full border-2 border-emerald-200 bg-emerald-50 px-6 py-3 text-base font-bold text-emerald-600"
        }
      >
        <Check className="h-4 w-4" />
        ホームに投稿済み
        <button
          type="button"
          onClick={cancelPost}
          disabled={busy}
          className="ml-1 text-xs font-medium text-emerald-500 underline hover:text-emerald-700 disabled:opacity-50"
        >
          取り消す
        </button>
      </div>
    );
  }

  // 未投稿: キャプション入力を開く前
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={
          isChromeVariant
            ? "inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-2 text-sm font-bold text-pink-500 shadow-md transition-transform hover:-translate-y-0.5"
            : "flex w-full items-center justify-center gap-2 rounded-full border-2 border-pink-300 bg-white px-6 py-3 text-base font-bold text-pink-500 transition-colors hover:bg-pink-50"
        }
      >
        <Home className="h-4 w-4" />
        ホームに投稿する
      </button>
    );
  }

  // 未投稿: キャプション入力(任意)
  return (
    <div className="w-full rounded-2xl border-2 border-pink-200 bg-white p-3 text-left">
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        maxLength={140}
        rows={2}
        placeholder={`『${displayName ?? ""}』をコンプリート！`}
        className="w-full resize-none rounded-lg border border-pink-100 bg-pink-50/40 px-3 py-2 text-sm text-stone-700 outline-none focus:border-pink-300"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="flex-1 rounded-full bg-pink-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-pink-600 disabled:opacity-50"
        >
          {busy ? "投稿中…" : "ホームに投稿する"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          disabled={busy}
          className="rounded-full px-4 py-2 text-sm font-medium text-stone-400 hover:bg-stone-100 disabled:opacity-50"
        >
          やめる
        </button>
      </div>
    </div>
  );
}
