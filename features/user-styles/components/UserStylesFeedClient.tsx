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
import { userStyleChipIds } from "@/features/user-styles/lib/user-style-chip-ids";
import { UserStylesFeedCardsSkeleton } from "@/features/user-styles/components/UserStylesFeedSkeleton";
import {
  CatalogSwipePanel,
  type CatalogTabMode,
} from "@/features/style-presets/components/CatalogSwipePanel";
import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";
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
 * 横スワイプで隣のタブを見せるときに描くカードの数(カタログ刷新後)。
 * 払っている間に見えるのは画面の高さの分だけなので、先頭だけ描く(1枚でほぼ画面が埋まる)。
 */
const PEEK_POST_COUNT = 2;

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
  // カタログ刷新(段階公開中は運営のみ)では、チップをタブにし、一覧の横スワイプで切り替える
  const isCatalogRevamp = useStylesCatalogRevamp();

  const [chip, setChip] = useState<UserStyleChipId>("all");
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [cursor, setCursor] = useState<UserStyleCursor | null>(initialCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [authors, setAuthors] = useState<UserStyleAuthor[]>([]);
  /*
    いま出していないタブの一覧(カタログ刷新後のみ)。
    - 隣のタブの1ページ目を先に取っておく(払ったとき・押したときに、待たずに出す)
    - 離れたタブの一覧を覚えておく(戻ったときに取り直さずに出す)
  */
  const [tabCache, setTabCache] = useState<
    Partial<Record<UserStyleChipId, UserStylePage>>
  >({});
  // 先読み中のタブ(二重に取りに行かない)
  const prefetchingRef = useRef(new Set<UserStyleChipId>());

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
      /*
        計測に渡す値は3つだけ（route 側の許可集合と揃える）。
        `startsWith` の三項では else 側が narrowing されず、将来チップを足したときに
        黙って通ってしまうので、**網羅的に写像する**。
      */
      const chipEvent: UserStyleChipEvent =
        next === "all" ? "all" : next === "usage" ? "usage" : "author";
      if (isCatalogRevamp) {
        // 離れるタブの一覧を覚えておく(戻ったとき・隣として見せるときに、すぐ出す)
        if (!isLoading && !hasError) {
          setTabCache((prev) => ({ ...prev, [chip]: { posts, nextCursor: cursor } }));
        }
        // 先読み済みなら、取り直さずにすぐ出す
        const cached = tabCache[next];
        if (cached) {
          // 前のタブで取得中だった結果は捨てる
          generationRef.current += 1;
          setChip(next);
          setPosts(cached.posts);
          setCursor(cached.nextCursor);
          setIsLoading(false);
          setHasError(false);
          trackUserStyleChip(chipEvent);
          return;
        }
      }
      setChip(next);
      setPosts([]);
      setCursor(null);
      trackUserStyleChip(chipEvent);
      void fetchPage(next, null);
    },
    [chip, cursor, fetchPage, hasError, isCatalogRevamp, isLoading, posts, tabCache]
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

  const chipIds = useMemo(() => userStyleChipIds(authors), [authors]);
  const activeChipIndex = chipIds.indexOf(chip);

  /*
    隣のタブの1ページ目を先に取っておく(カタログ刷新後のみ)。
    払い始めたときに中身が見え、切り替えた瞬間に一覧を出せるようにする。
    失敗しても、切り替えたときにいつもどおり取り直すだけ。
  */
  useEffect(() => {
    if (!isCatalogRevamp) {
      return;
    }
    const neighbors = [chipIds[activeChipIndex - 1], chipIds[activeChipIndex + 1]];
    for (const neighbor of neighbors) {
      if (!neighbor || tabCache[neighbor] || prefetchingRef.current.has(neighbor)) {
        continue;
      }
      prefetchingRef.current.add(neighbor);
      void (async () => {
        try {
          const res = await fetch(`/api/user-styles?${buildQuery(neighbor, null)}`);
          if (!res.ok) {
            return;
          }
          const page = (await res.json()) as UserStylePage;
          // 取得中に開いて覚えた一覧があれば、そちらを残す
          setTabCache((prev) => (prev[neighbor] ? prev : { ...prev, [neighbor]: page }));
        } catch {
          // 先読みできなくても、切り替えたときに取り直す
        } finally {
          prefetchingRef.current.delete(neighbor);
        }
      })();
    }
  }, [activeChipIndex, buildQuery, chipIds, isCatalogRevamp, tabCache]);

  /** 払っている間に横に見せる、隣のタブの一覧の先頭(先に取れていれば)。 */
  const peekPosts = useMemo(() => {
    if (!isCatalogRevamp) {
      return [];
    }
    return [chipIds[activeChipIndex - 1], chipIds[activeChipIndex + 1]].flatMap(
      (neighbor) =>
        neighbor ? tabCache[neighbor]?.posts.slice(0, PEEK_POST_COUNT) ?? [] : []
    );
  }, [activeChipIndex, chipIds, isCatalogRevamp, tabCache]);

  /*
    CTA とフォロー状態は、隣のタブの先頭の分も先に取っておく。
    切り替えた後に CTA が遅れて出て、カードの高さが変わるのを防ぐ。
  */
  const postIds = useMemo(
    () =>
      [...posts, ...peekPosts]
        .map((post) => post.id)
        .filter((id): id is string => !!id),
    [posts, peekPosts]
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
    for (const post of [...posts, ...peekPosts]) {
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
  }, [posts, peekPosts, promptActions]);
  const { followStatuses, setFollowStatus } = useFeedFollowStatus(
    authorIds,
    currentUserId,
    true
  );

  /** フィードのカード1枚。一覧と、払っている間に見せる隣のタブの一覧で共用する。 */
  const renderFeedCard = (
    post: Post,
    { prioritizeImage, eagerAvatar }: { prioritizeImage: boolean; eagerAvatar: boolean }
  ) => (
    <PostFeedCard
      post={post}
      currentUserId={currentUserId}
      prioritizeImage={prioritizeImage}
      eagerAvatar={eagerAvatar}
      // ⭐ ホーム専用の指標なので、この画面では記録しない
      trackImpressions={false}
      /*
        ⭐ この一覧は原作だけで構成されていて投稿者＝原作者なので、
        引用元のクレジット（枠・見出し・アイコン・名前）は
        カード上部の作者行の繰り返しになる。ボタンだけ残す。
      */
      hideRootCredit
      isFollowingAuthor={
        post.user?.id ? followStatuses[post.user.id] : undefined
      }
      isFollowingPromptAuthor={(() => {
        // CTA のフォロー判定は原作者を見る
        const originAuthorId = post.id
          ? promptActions[post.id]?.originAuthorId
          : null;
        return originAuthorId ? followStatuses[originAuthorId] : undefined;
      })()}
      onFollowChange={setFollowStatus}
      promptAction={post.id ? promptActions[post.id] : undefined}
      stylePresetLink={post.id ? styleLinks[post.id] : undefined}
    />
  );

  /**
   * タブの一覧(注記・カード・読み込み)。
   * - page: 選択中のタブの一覧。いまの状態(posts / cursor / 読み込み中・失敗)から描く
   * - peek: 横スワイプ中に隣に見せる、隣のタブの一覧の先頭(カタログ刷新後)。
   *   先に取った一覧から先頭の数件だけ描き、画像とアイコンはすぐ読み込む。
   *   まだ取れていなければ骨組みを出す
   * ⭐ 切り替えるとこの見本がそのまま一覧になる(CatalogSwipePanel)。形を変えると
   * カードが作り直され、表示済みのアイコンや画像が一瞬グレーに戻るので、page と peek で
   * 形(並び・key)をそろえること。
   */
  const renderTabList = (chipId: UserStyleChipId, mode: CatalogTabMode) => {
    const isCurrent = chipId === chip;
    const cached = isCurrent ? undefined : tabCache[chipId];
    const tabPosts = isCurrent ? posts : cached?.posts ?? [];
    const tabCursor = isCurrent ? cursor : cached?.nextCursor ?? null;
    const tabLoading = isCurrent ? isLoading : !cached;
    const tabError = isCurrent && hasError;
    const shownPosts =
      mode === "peek" ? tabPosts.slice(0, PEEK_POST_COUNT) : tabPosts;
    return (
      <>
        {chipId === "usage" && tabPosts.length > 0 ? (
          <p className="mb-3 text-xs text-slate-500">{t("usageSortNote")}</p>
        ) : null}

        {tabPosts.length === 0 && !tabLoading && !tabError ? (
          <p className="py-16 text-center text-sm text-gray-500">{t("empty")}</p>
        ) : isCatalogRevamp && tabPosts.length === 0 && tabLoading ? (
          // 取り直している間・まだ先読みできていない隣のタブ(刷新後のみ。刷新前はこれまでどおり空のまま待つ)
          <UserStylesFeedCardsSkeleton />
        ) : (
          // フィード: スマホもPCも1列。読みやすさのため最大幅を絞って中央寄せする
          // (ホームのフィードと同じ 600px)。
          <div className="mx-auto flex max-w-[600px] flex-col">
            {shownPosts.map((post, index) => (
              <div
                key={post.id}
                data-post-id={mode === "page" ? post.id : undefined}
                className="mb-4"
              >
                {renderFeedCard(post, {
                  prioritizeImage: mode === "peek" || index < 2,
                  eagerAvatar: mode === "peek",
                })}
              </div>
            ))}
          </div>
        )}

        {mode === "page" && tabError ? (
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
        {mode === "page" && tabCursor && !tabError ? (
          <div ref={sentinelRef} className="h-12" aria-hidden="true" />
        ) : null}
      </>
    );
  };

  return (
    <div>
      <UserStyleChips active={chip} authors={authors} onSelect={handleSelect} />

      {isCatalogRevamp ? (
        <CatalogSwipePanel
          tabKeys={chipIds}
          activeKey={chip}
          onSwipeTo={handleSelect}
          renderTab={renderTabList}
        />
      ) : (
        renderTabList(chip, "page")
      )}
    </div>
  );
}
