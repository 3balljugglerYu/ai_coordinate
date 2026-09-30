"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useInView } from "react-intersection-observer";
import { GeneratedImageGallery } from "./GeneratedImageGallery";
import { GeneratedImageList } from "./GeneratedImageList";
import { GalleryViewToggle } from "./GalleryViewToggle";
import {
  readPreferredGalleryView,
  writePreferredGalleryView,
  type CoordinateGalleryView,
} from "../lib/gallery-view-preference";
import { useGenerationState } from "../context/GenerationStateContext";
import { getGeneratedImages } from "../lib/database";
import { getCurrentUser } from "@/features/auth/lib/auth-client";
import type { GeneratedImageData, GenerationType } from "../types";
import type { GeneratedImageRecord } from "../lib/database";
import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";

/**
 * 直近の生成をいくつ出すか。
 *
 * `/free` の一覧と同じ 4 件にしている。シートの中なので、これ以上並べると
 * モバイルのボトムシートが延々と伸びる。過去の分をすべて見たい人は
 * `/free` へ行けばよい。
 */
const RECENT_LIMIT = 4;

/**
 * カタログ刷新後(公開前は運営だけ)の1ページの件数。
 *
 * 刷新後は、そのカタログ(Persta ORIGINAL / User ORIGINAL)で作ったもの全部を並べ、
 * 下へ進むと続きを読み込む(2026-09-30 ユーザー決定)。/style の一覧(4件ずつ)より多めにし、下端の
 * {@link LOAD_MORE_ROOT_MARGIN} 手前から先読みして、待たされる感じを減らす。
 */
const CATALOG_PAGE_SIZE = 8;
const LOAD_MORE_ROOT_MARGIN = "400px";

/**
 * リスト表示の「詳細画面へ」から戻ったときの位置合わせ用のキー。
 * シートはホームなどの上に開くので、/style・/free のキーを使い回さない
 * (使い回すと、あとで /style を開いたときに関係ない位置へ飛ぶ)。
 */
const CATALOG_SHEET_RETURN_TO_IMAGE_ID_KEY = "persta-ai:catalog-sheet-return-to-image-id";

function toImageData(records: GeneratedImageRecord[]): GeneratedImageData[] {
  return records.flatMap((record) =>
    record.id
      ? [
          {
            id: record.id,
            url: record.image_url,
            is_posted: record.is_posted ?? false,
            createdAt: record.created_at,
            model: record.model ?? null,
            width: record.width ?? null,
            height: record.height ?? null,
            preGenerationStoragePath: record.pre_generation_storage_path ?? null,
            showBeforeImage: record.show_before_image ?? true,
            sourcePostId: record.source_post_id ?? null,
          } satisfies GeneratedImageData,
        ]
      : []
  );
}

/**
 * 派生生成シート内の結果一覧。
 *
 * 「Free Style と同じことをしている」画面なので、`/free` と同じく
 * **そのシートで作った分 + 過去のじゆうモード生成**を並べる。
 *
 * シートで作った分だけを出していた頃は、閉じたあとに作ったものが
 * どこへ行ったのか分からなかった。過去の分と一緒に並んでいれば
 * 「いつもの場所に貯まっている」ことがその場で伝わる。
 *
 * 新しいものが先頭に来るよう、プロバイダの `previewImages` を過去分より
 * 前に置く。ID が重なった分は先頭側を残す（生成直後に DB からも引けた場合、
 * 進捗つきのプレビュー側を優先したい）。
 *
 * `GeneratedImageGallery` をそのまま使うので、拡大表示と投稿モーダルも
 * 付いてくる。シートを閉じずに投稿まで進める。
 *
 * `/styles` の生成シート(One-Tap Style)でも使う。そのときは
 * `generationType="one_tap_style"` で、One-Tap Style の過去の生成を並べる。
 */
export function PromptLockedGenerationResults({
  generationType = "free",
}: {
  /** どの生成の一覧か。既定は Free Style(User ORIGINAL の生成シート)。 */
  generationType?: Extract<GenerationType, "free" | "one_tap_style">;
} = {}) {
  const freeT = useTranslations("free");
  const styleT = useTranslations("style");
  const t = generationType === "one_tap_style" ? styleT : freeT;
  const generationState = useGenerationState();
  const isCatalogRevamp = useStylesCatalogRevamp();
  const [recentImages, setRecentImages] = useState<GeneratedImageData[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  /*
    刷新後はグリッドとリストを切り替えられる(/style の一覧と同じ部品・同じ記憶)。
    この一覧はシートの中にしか無く、シートはどれもブラウザだけで描く(dynamic の
    ssr: false)ので、覚えている表示を最初から読んでよい(SSR とずれない)。
  */
  const [viewMode, setViewMode] = useState<CoordinateGalleryView>(() =>
    typeof window === "undefined" ? "grid" : readPreferredGalleryView()
  );
  const handleViewChange = (next: CoordinateGalleryView) => {
    setViewMode(next);
    writePreferredGalleryView(next);
  };
  // 読み込みの世代。条件が変わったり取り直したりしたら、古い応答を捨てる
  const generationRef = useRef(0);
  const userIdRef = useRef<string | null>(null);

  const previewImages = generationState?.previewImages;
  const isGenerating = generationState?.isGenerating ?? false;
  const generatingCount = generationState?.generatingCount ?? 0;

  /*
    刷新後は、そのカタログで作ったもの全部をページごとに読む(2026-09-30 ユーザー決定。
    開いたスタイルや投稿だけには絞らない)。
    - Persta ORIGINAL のシート: One-Tap Style の生成すべて(どのスタイルでも)
    - User ORIGINAL のシート: みんなのカタログを使って作ったものすべて(source_post_id あり)。
      自分でプロンプトを書いて作ったもの(CREATE の一覧に並ぶ)は入れない
    一般の利用者は今までどおり、その生成の種類の最新 RECENT_LIMIT 件だけ。
  */
  const pageSize = isCatalogRevamp ? CATALOG_PAGE_SIZE : RECENT_LIMIT;
  const catalogDerivedOnly = isCatalogRevamp && generationType === "free";

  const fetchPage = useCallback(
    async (userId: string, offset: number) =>
      getGeneratedImages(userId, pageSize, offset, generationType, {
        catalogDerivedOnly,
      }),
    [pageSize, generationType, catalogDerivedOnly]
  );

  /*
    過去の生成を取りに行く(1ページ目)。

    サーバーコンポーネントの一覧 (CachedGeneratedImageGallery) は投稿詳細
    ページから使えないため、ブラウザの Supabase クライアントで引く。
    RLS が本人の行だけに絞るので、他人の生成物は返らない。

    生成が終わるたびに1ページ目から引き直して、投稿済みバッジなどの状態を追従させる。
  */
  useEffect(() => {
    const generation = ++generationRef.current;

    const load = async () => {
      const user = await getCurrentUser();
      if (!user || generation !== generationRef.current) return;
      userIdRef.current = user.id;

      const records = await fetchPage(user.id, 0).catch(() => []);
      if (generation !== generationRef.current) return;

      setRecentImages(toImageData(records));
      // 一般の利用者は最新だけを出す(続きは読まない)
      setHasMore(isCatalogRevamp && records.length === pageSize);
      setIsLoadingMore(false);
    };

    void load();
    // 生成中フラグが落ちた（＝完了した）タイミングで引き直す
  }, [isGenerating, fetchPage, isCatalogRevamp, pageSize]);

  // 下端が近づいたら続きを読む(刷新後だけ)。シートの中のスクロールでも効く
  const { ref: loadMoreRef, inView } = useInView({
    rootMargin: LOAD_MORE_ROOT_MARGIN,
    skip: !hasMore,
  });

  useEffect(() => {
    const userId = userIdRef.current;
    if (!inView || !hasMore || isLoadingMore || !userId) return;
    const generation = generationRef.current;

    const fetchMore = async () => {
      setIsLoadingMore(true);
      const records = await fetchPage(userId, recentImages.length).catch(
        () => null
      );
      if (generation !== generationRef.current) return;
      if (records === null) {
        // 失敗したら続きは諦める(直らない読み込み中を残さない)
        setHasMore(false);
      } else {
        // 取得の間に先頭へ増えた分とかぶることがあるので、ID で重ねない
        setRecentImages((prev) => {
          const existingIds = new Set(prev.map((image) => image.id));
          return [
            ...prev,
            ...toImageData(records).filter((image) => !existingIds.has(image.id)),
          ];
        });
        setHasMore(records.length === pageSize);
      }
      setIsLoadingMore(false);
    };

    void fetchMore();
  }, [inView, hasMore, isLoadingMore, fetchPage, recentImages.length, pageSize]);

  // 新しいものを先頭に。ID が重なったら先頭側を残す。
  const seen = new Set<string>();
  const images = [...(previewImages ?? []), ...recentImages].filter((image) => {
    if (seen.has(image.id)) return false;
    seen.add(image.id);
    return true;
  });

  // 生成前で過去分も無ければ何も出さない。空の見出しだけが残ると失敗に見える。
  if (images.length === 0 && !isGenerating) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">
          {t("resultsTitle")}
        </h3>
        {isCatalogRevamp ? (
          <GalleryViewToggle value={viewMode} onChange={handleViewChange} />
        ) : null}
      </div>
      {isCatalogRevamp && viewMode === "list" ? (
        <GeneratedImageList
          images={images}
          isGenerating={isGenerating}
          generatingCount={generatingCount}
          detailFromParam={generationType === "one_tap_style" ? "style" : "free"}
          returnToImageIdKey={CATALOG_SHEET_RETURN_TO_IMAGE_ID_KEY}
          /*
            「このイラストで生成」: User ORIGINAL のシートは、シートの中のフォーム
            (GenerationForm)がその場で受け取る。Persta ORIGINAL のシートのフォームは
            受け取れないので、/style と同じく確認して /free へ移る。
          */
          applyActionMode={generationType === "one_tap_style" ? "navigate-free" : "dispatch-event"}
          generationType={generationType}
        />
      ) : (
        <GeneratedImageGallery
          images={images}
          isGenerating={isGenerating}
          generatingCount={generatingCount}
        />
      )}
      {hasMore ? (
        /*
          続きの目印。読み込み中は画像の枠を先に出して待つ
          (一覧が急に伸びてスクロール位置が跳ねないように、高さを確保しておく)。
        */
        <div ref={loadMoreRef} data-testid="prompt-locked-results-more">
          {isLoadingMore ? (
            <div className="grid grid-cols-2 gap-4" aria-hidden="true">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="overflow-hidden rounded-lg border bg-gray-100">
                  <div className="aspect-square w-full animate-pulse bg-gray-200" />
                </div>
              ))}
            </div>
          ) : (
            <div className="h-8" />
          )}
        </div>
      ) : null}
    </div>
  );
}
