"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PostFeedCard } from "@/features/posts/components/PostFeedCard";
import { useFeedPromptActions } from "@/features/posts/hooks/useFeedPromptActions";
import { useFeedFollowStatus } from "@/features/posts/hooks/useFeedFollowStatus";
import {
  UserStyleChips,
  type UserStyleChipId,
} from "@/features/user-styles/components/UserStyleChips";
import {
  trackUserStyleChip,
  trackUserStyleVisit,
  type UserStyleChipEvent,
} from "@/features/user-styles/lib/track-event";
import { USER_STYLE_PAGE_SIZE } from "@/features/user-styles/lib/constants";
import type {
  UserStyleAuthor,
  UserStyleCursor,
  UserStylePage,
} from "@/features/user-styles/types";
import type { Post } from "@/features/posts/types";

/**
 * /user-styles の一覧本体。
 *
 * ⭐ **ホームのフィードとまったく同じカード（`PostFeedCard`）を1列で並べる**（ADR-010）。
 * あのカードは Before/After・引用元カード・「このプロンプトで生成する」CTA・
 * フォロー分岐・生成シートの起動をすべて内蔵しているので、**確認モーダルも
 * 生成導線もここでは作らない**。二重に持つと片方だけ直す事故が起きる。
 *
 * ⭐ **`PostList` は使わない。** あちらはホームのタブ・並び順の記憶・
 * インプレッション計測・中間タブの取り直しを内蔵していて、汎用の一覧ではない。
 *
 * ⭐ **インプレッションは記録しない**（`trackImpressions={false}`）。
 * ホーム専用の指標なので、混ぜると既存の数字の意味が変わる（REQ-008）。
 */
export function UserStylesFeedClient({
  initialPosts,
  initialCursor,
  currentUserId,
}: {
  initialPosts: Post[];
  initialCursor: UserStyleCursor | null;
  currentUserId: string | null;
}) {
  const t = useTranslations("userStyles");

  const [chip, setChip] = useState<UserStyleChipId>("all");
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [cursor, setCursor] = useState<UserStyleCursor | null>(initialCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [authors, setAuthors] = useState<UserStyleAuthor[]>([]);

  /*
    取得の世代。チップを切り替えた直後に前の取得が返ってきても、
    古い結果で新しい一覧を上書きしないようにする
    （速い回線で連打すると実際に起きる）。
  */
  const generationRef = useRef(0);

  // 訪問の計測。マウント時に1回だけ。
  useEffect(() => {
    trackUserStyleVisit();
  }, []);

  /*
    作者チップはマウント後に足す。閲覧者依存（フォロー中の人しか出ない）なので
    静的シェルに載せられない。未ログイン・取得失敗ならチップが出ないだけ。
  */
  useEffect(() => {
    if (!currentUserId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/user-styles/authors");
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as { authors?: UserStyleAuthor[] };
        if (!cancelled) {
          setAuthors(data.authors ?? []);
        }
      } catch {
        // チップが出ないだけでページは成立する
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  /** チップの選択を API のクエリへ翻訳する。 */
  const buildQuery = useCallback(
    (target: UserStyleChipId, nextCursor: UserStyleCursor | null) => {
      const params = new URLSearchParams({ limit: String(USER_STYLE_PAGE_SIZE) });
      if (target === "usage") {
        params.set("sort", "usage");
      } else if (target.startsWith("author:")) {
        params.set("author", target.slice("author:".length));
      }
      if (nextCursor) {
        params.set("cursorPostedAt", nextCursor.postedAt);
        params.set("cursorId", nextCursor.id);
      }
      return params.toString();
    },
    []
  );

  const fetchPage = useCallback(
    async (target: UserStyleChipId, nextCursor: UserStyleCursor | null) => {
      const generation = ++generationRef.current;
      setIsLoading(true);
      setHasError(false);
      try {
        const res = await fetch(`/api/user-styles?${buildQuery(target, nextCursor)}`);
        if (!res.ok) {
          throw new Error(`user-styles ${res.status}`);
        }
        const page = (await res.json()) as UserStylePage;
        if (generation !== generationRef.current) {
          return;
        }
        setPosts((prev) => (nextCursor ? [...prev, ...page.posts] : page.posts));
        setCursor(page.nextCursor);
      } catch {
        if (generation === generationRef.current) {
          setHasError(true);
        }
      } finally {
        if (generation === generationRef.current) {
          setIsLoading(false);
        }
      }
    },
    [buildQuery]
  );

  /*
    チップ切替は**サーバーから取り直す**。`/styles` のようにクライアント側で
    配列を絞る方式にはしない ── ページングと両立しないため（1ページ目しか
    持っていない状態で絞ると、2ページ目以降が永久に出てこない）。
  */
  const handleSelect = useCallback(
    (next: UserStyleChipId) => {
      if (next === chip) {
        return;
      }
      setChip(next);
      setPosts([]);
      setCursor(null);
      /*
        計測に渡す値は3つだけ（route 側の許可集合と揃える）。
        `startsWith` の三項では else 側が narrowing されず、将来チップを足したときに
        黙って通ってしまうので、**網羅的に写像する**。
      */
      const chipEvent: UserStyleChipEvent =
        next === "all" ? "all" : next === "usage" ? "usage" : "author";
      trackUserStyleChip(chipEvent);
      void fetchPage(next, null);
    },
    [chip, fetchPage]
  );

  const loadMore = useCallback(() => {
    if (isLoading || !cursor) {
      return;
    }
    void fetchPage(chip, cursor);
  }, [chip, cursor, fetchPage, isLoading]);

  // 末尾の番兵が見えたら次ページを読む。
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor || hasError) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMore();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, hasError, loadMore]);

  const postIds = useMemo(
    () => posts.map((post) => post.id).filter((id): id is string => !!id),
    [posts]
  );
  const { summaries: promptActions, styleLinks } = useFeedPromptActions(
    postIds,
    true
  );

  /*
    フォロー状態は投稿者と原作者の両方を集めて1回で引く。
    この一覧は原作（root）だけなので普通は同じ人だが、CTA の判定は原作者を見るため
    PostList と同じ形にしておく（片方だけにすると派生が混ざったときに静かに壊れる）。
  */
  const authorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const post of posts) {
      if (post.user?.id) {
        ids.add(post.user.id);
      }
      const originAuthorId = post.id
        ? promptActions[post.id]?.originAuthorId
        : null;
      if (originAuthorId) {
        ids.add(originAuthorId);
      }
    }
    return Array.from(ids);
  }, [posts, promptActions]);
  const { followStatuses, setFollowStatus } = useFeedFollowStatus(
    authorIds,
    currentUserId,
    true
  );

  return (
    <div>
      <UserStyleChips active={chip} authors={authors} onSelect={handleSelect} />

      {chip === "usage" && posts.length > 0 ? (
        <p className="mb-3 text-xs text-slate-500">{t("usageSortNote")}</p>
      ) : null}

      {posts.length === 0 && !isLoading && !hasError ? (
        <p className="py-16 text-center text-sm text-gray-500">{t("empty")}</p>
      ) : (
        // フィード: スマホもPCも1列。読みやすさのため最大幅を絞って中央寄せする
        // (ホームのフィードと同じ 600px)。
        <div className="mx-auto flex max-w-[600px] flex-col">
          {posts.map((post, index) => (
            <div key={post.id} data-post-id={post.id} className="mb-4">
              <PostFeedCard
                post={post}
                currentUserId={currentUserId}
                prioritizeImage={index < 2}
                // ⭐ ホーム専用の指標なので、この画面では記録しない
                trackImpressions={false}
                isFollowingAuthor={
                  post.user?.id ? followStatuses[post.user.id] : undefined
                }
                isFollowingPromptAuthor={(() => {
                  // CTA のフォロー判定は原作者を見る
                  const originAuthorId = post.id
                    ? promptActions[post.id]?.originAuthorId
                    : null;
                  return originAuthorId
                    ? followStatuses[originAuthorId]
                    : undefined;
                })()}
                onFollowChange={setFollowStatus}
                promptAction={post.id ? promptActions[post.id] : undefined}
                stylePresetLink={post.id ? styleLinks[post.id] : undefined}
              />
            </div>
          ))}
        </div>
      )}

      {hasError ? (
        <div className="py-8 text-center">
          <p className="mb-3 text-sm text-gray-500">{t("loadFailed")}</p>
          <button
            type="button"
            onClick={() => void fetchPage(chip, cursor)}
            className="min-h-[44px] rounded-full border border-gray-200 bg-white px-5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("loadMore")}
          </button>
        </div>
      ) : null}

      {/* 次ページの読み込み位置。cursor が無ければ描かない(=最後のページ)。 */}
      {cursor && !hasError ? (
        <div ref={sentinelRef} className="h-12" aria-hidden="true" />
      ) : null}
    </div>
  );
}
