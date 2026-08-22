/** @jest-environment jsdom */

/**
 * 一覧 → 詳細で「タップした作品のサムネイルを先に描く」仕組み。
 *
 * 詳細の `<img>` はサーバー応答に含まれて届くので、要素が生まれるのは
 * 約0.8秒後。サムネイルは既にキャッシュにあるのに描きようがなく、
 * それまでグレーの箱を見せていた。タップ時に見た目だけ先渡しして埋める。
 *
 * ⭐ 守りたいのは2つ。
 * 1. **ID が一致したときだけ使う**。ズレると開いた瞬間に別の作品の絵が見えて
 *    差し替わる（いちばん事故に見える壊れ方）。
 * 2. **`unoptimized` を外さない**。一覧は生の `_thumb.webp` を出しており、
 *    最適化を通すと別 URL になってキャッシュに当たらず、先出しが
 *    黙って無意味になる（画面上は何も変わらないので気づけない）。
 */

import React from "react";
import { render } from "@testing-library/react";
import {
  clearPendingPostPreview,
  getPendingPostPreview,
  getPendingPostPreviewServerSnapshot,
  matchPendingPostPreview,
  setPendingPostPreview,
  subscribePendingPostPreview,
} from "@/features/posts/lib/pending-post-preview";
import {
  PostDetailSkeletonImage,
  extractPostIdFromPathname,
} from "@/features/posts/components/PostDetailSkeletonImage";

let mockPathname = "/ja/posts/post-1";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    unoptimized,
    className,
    ...rest
  }: Record<string, unknown>) =>
    React.createElement("img", {
      src,
      alt,
      className,
      "data-unoptimized": unoptimized ? "true" : "false",
      ...(rest["aria-hidden"] ? { "aria-hidden": true } : {}),
    }),
}));

const THUMB = "https://example.test/a_thumb.webp";

beforeEach(() => {
  clearPendingPostPreview();
  mockPathname = "/ja/posts/post-1";
});

describe("extractPostIdFromPathname", () => {
  test("ロケール付き・無しのどちらからも取れる", () => {
    expect(extractPostIdFromPathname("/ja/posts/abc-123")).toBe("abc-123");
    expect(extractPostIdFromPathname("/posts/abc-123")).toBe("abc-123");
  });

  test("クエリ・ハッシュは落とす", () => {
    expect(extractPostIdFromPathname("/ja/posts/abc?from=home")).toBe("abc");
    expect(extractPostIdFromPathname("/ja/posts/abc#comments")).toBe("abc");
  });

  test("投稿詳細でないパスや null では取れない", () => {
    expect(extractPostIdFromPathname("/ja")).toBeNull();
    expect(extractPostIdFromPathname(null)).toBeNull();
  });
});

describe("matchPendingPostPreview", () => {
  const preview = { postId: "post-1", thumbnailUrl: THUMB };

  test("ID が一致したときだけ返す", () => {
    expect(matchPendingPostPreview(preview, "post-1")).toBe(preview);
  });

  test("⭐別の作品の値は使わない", () => {
    expect(matchPendingPostPreview(preview, "post-2")).toBeNull();
  });

  test("値が無い・ID が取れないときは使わない", () => {
    expect(matchPendingPostPreview(null, "post-1")).toBeNull();
    expect(matchPendingPostPreview(preview, null)).toBeNull();
  });
});

describe("受け渡し箱", () => {
  test("置いた値を読める", () => {
    setPendingPostPreview({ postId: "post-1", thumbnailUrl: THUMB });
    expect(getPendingPostPreview()).toEqual({
      postId: "post-1",
      thumbnailUrl: THUMB,
    });
  });

  test("⭐読んでも消えない（getSnapshot は副作用を持たない）", () => {
    setPendingPostPreview({ postId: "post-1", thumbnailUrl: THUMB });

    const first = getPendingPostPreview();
    const second = getPendingPostPreview();

    // useSyncExternalStore は同じ参照が返ることを前提にしている
    expect(first).toBe(second);
  });

  test("SSR 側は常に無し（サーバーは遷移元を知らない）", () => {
    setPendingPostPreview({ postId: "post-1", thumbnailUrl: THUMB });
    expect(getPendingPostPreviewServerSnapshot()).toBeNull();
  });

  test("置き換えると購読者に通知される", () => {
    const listener = jest.fn();
    const unsubscribe = subscribePendingPostPreview(listener);

    setPendingPostPreview({ postId: "post-1", thumbnailUrl: THUMB });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setPendingPostPreview(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("PostDetailSkeletonImage", () => {
  test("一覧から来たときは、そのサムネイルを描く", () => {
    setPendingPostPreview({
      postId: "post-1",
      thumbnailUrl: THUMB,
      aspectRatio: "portrait",
    });

    const { container } = render(<PostDetailSkeletonImage />);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe(THUMB);
    // グレーの箱は出ない
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  test("⭐一覧と同じ生 URL にするため unoptimized で出す", () => {
    setPendingPostPreview({ postId: "post-1", thumbnailUrl: THUMB });

    const { container } = render(<PostDetailSkeletonImage />);

    expect(container.querySelector("img")?.getAttribute("data-unoptimized")).toBe(
      "true"
    );
  });

  test("直リンク（値が無い）ときは従来どおりグレーの箱", () => {
    const { container } = render(<PostDetailSkeletonImage />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  test("⭐別の作品の値が残っていても使わない", () => {
    setPendingPostPreview({ postId: "post-other", thumbnailUrl: THUMB });

    const { container } = render(<PostDetailSkeletonImage />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  test("縦横比が分かっているときは詳細本体と同じ高さの決め方にする", () => {
    setPendingPostPreview({
      postId: "post-1",
      thumbnailUrl: THUMB,
      aspectRatio: "portrait",
    });

    const { container } = render(<PostDetailSkeletonImage />);

    // 本体(PostDetailStatic)と同じ max-h-[50vh]。違うと届いた瞬間に跳ねる
    expect(container.firstElementChild?.className).toContain("max-h-[50vh]");
    expect(container.firstElementChild?.className).not.toContain("aspect-square");
  });

  test("縦横比が不明なら正方形の枠に収める", () => {
    setPendingPostPreview({ postId: "post-1", thumbnailUrl: THUMB });

    const { container } = render(<PostDetailSkeletonImage />);

    expect(container.firstElementChild?.className).toContain("aspect-square");
  });

  test("読み上げでは飛ばす（装飾であって本文ではない）", () => {
    setPendingPostPreview({ postId: "post-1", thumbnailUrl: THUMB });

    const { container } = render(<PostDetailSkeletonImage />);

    expect(container.querySelector("img")).toHaveAttribute("aria-hidden");
  });
});
