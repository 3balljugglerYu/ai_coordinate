/** @jest-environment jsdom */

/**
 * 投稿詳細のメイン画像。
 *
 * ホームのカードは `_thumb.webp`、詳細は `_display.webp` を出しており、
 * **URL が違うためブラウザキャッシュが効かず、詳細を開くたびに画像を
 * 取り直していた**（実測 0.57〜0.77秒）。サムネイルを先に描いて繋ぐ。
 *
 * ⭐ next/image のキャッシュキーは `/_next/image?url=…&w=…&q=…` の完全一致で、
 * `w` は `sizes` から決まる。**サムネ側の `sizes` がフィードとズレた瞬間に
 * キャッシュに当たらなくなり、この最適化は黙って無効になる**。
 * 画面上は何も変わらないので気づけない。だからここで固定する。
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PostDetailHeroImage } from "@/features/posts/components/PostDetailHeroImage";
import { FEED_CARD_MAX_WIDTH_PX } from "@/features/posts/lib/constants";

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    sizes,
    className,
    priority,
    unoptimized,
    onLoad,
    ...rest
  }: Record<string, unknown>) =>
    React.createElement("img", {
      src,
      alt,
      sizes,
      className,
      "data-priority": priority ? "true" : "false",
      "data-unoptimized": unoptimized ? "true" : "false",
      onLoad,
      ...(rest["aria-hidden"] ? { "aria-hidden": true } : {}),
    }),
}));

const DISPLAY = "https://example.test/a_display.webp";
const THUMB = "https://example.test/a_thumb.webp";

function imgs() {
  return Array.from(document.querySelectorAll("img"));
}

describe("PostDetailHeroImage", () => {
  test("サムネイルがあれば2枚重ねて描く（下=サムネ / 上=表示用）", () => {
    render(
      <PostDetailHeroImage displayUrl={DISPLAY} thumbnailUrl={THUMB} alt="うちの子" />
    );

    const all = imgs();
    expect(all).toHaveLength(2);
    expect(all[0].getAttribute("src")).toBe(THUMB);
    expect(all[1].getAttribute("src")).toBe(DISPLAY);
  });

  test("⭐サムネ側は unoptimized（フィード・グリッドと同じ生URLでないとキャッシュに当たらない）", () => {
    render(
      <PostDetailHeroImage displayUrl={DISPLAY} thumbnailUrl={THUMB} alt="うちの子" />
    );

    /*
      BeforeAfterFrame / PostCard が unoptimized で生の _thumb.webp を出しており、
      ここだけ最適化を通すと /_next/image?... という別 URL になって
      繋ぎが黙って無効になる。画面上は何も変わらないので気づけない。
    */
    expect(imgs()[0].getAttribute("data-unoptimized")).toBe("true");
  });

  test("サムネ側の sizes もフィードのカードと同じ式にしておく", () => {
    render(
      <PostDetailHeroImage displayUrl={DISPLAY} thumbnailUrl={THUMB} alt="うちの子" />
    );

    // unoptimized なので URL には効かないが、最適化に戻したときのために揃える
    expect(imgs()[0].getAttribute("sizes")).toBe(
      `(max-width: ${FEED_CARD_MAX_WIDTH_PX}px) 100vw, ${FEED_CARD_MAX_WIDTH_PX}px`
    );
  });

  test("表示用は最適化を通す（生の 229KB をそのまま配らない）", () => {
    render(
      <PostDetailHeroImage displayUrl={DISPLAY} thumbnailUrl={THUMB} alt="うちの子" />
    );

    expect(imgs()[1].getAttribute("data-unoptimized")).toBe("false");
  });

  test("⭐表示用の sizes は器の幅(896px)まで。4K幅を要求しない", () => {
    render(
      <PostDetailHeroImage displayUrl={DISPLAY} thumbnailUrl={THUMB} alt="うちの子" />
    );

    const sizes = imgs()[1].getAttribute("sizes") ?? "";
    expect(sizes).toBe("(max-width: 896px) 100vw, 896px");
    /*
      既定値(デスクトップ側)は px で固定する。以前は `80vw` で、
      画面幅に比例して膨らみ DPR2 の PC で w=3840(4K幅)を引き当てていた。
    */
    expect(sizes).not.toContain("80vw");
    expect(sizes.split(",")[1].trim()).toBe("896px");
  });

  test("表示用が読み込まれるまで透明にして、サムネイルを見せる", () => {
    render(
      <PostDetailHeroImage displayUrl={DISPLAY} thumbnailUrl={THUMB} alt="うちの子" />
    );

    const display = imgs()[1];
    expect(display.className).toContain("opacity-0");

    fireEvent.load(display);

    expect(display.className).toContain("opacity-100");
    expect(display.className).not.toContain("opacity-0");
  });

  test("読み上げではサムネイルを飛ばし、説明は表示用に付ける", () => {
    render(
      <PostDetailHeroImage displayUrl={DISPLAY} thumbnailUrl={THUMB} alt="うちの子" />
    );

    expect(imgs()[0]).toHaveAttribute("aria-hidden");
    expect(screen.getByAltText("うちの子").getAttribute("src")).toBe(DISPLAY);
  });

  test("表示用だけ priority を付ける（サムネはキャッシュ前提で急がせない）", () => {
    render(
      <PostDetailHeroImage displayUrl={DISPLAY} thumbnailUrl={THUMB} alt="うちの子" />
    );

    expect(imgs()[0].getAttribute("data-priority")).toBe("false");
    expect(imgs()[1].getAttribute("data-priority")).toBe("true");
  });

  test("サムネイルが無ければ1枚だけ描く（余計なリクエストを増やさない）", () => {
    render(<PostDetailHeroImage displayUrl={DISPLAY} alt="うちの子" />);

    const all = imgs();
    expect(all).toHaveLength(1);
    expect(all[0].getAttribute("src")).toBe(DISPLAY);
    expect(all[0].className).not.toContain("opacity-0");
  });

  test("サムネイルと表示用が同じURLなら重ねない", () => {
    render(
      <PostDetailHeroImage displayUrl={DISPLAY} thumbnailUrl={DISPLAY} alt="うちの子" />
    );

    expect(imgs()).toHaveLength(1);
  });

  test("⭐displaySizes を渡すと表示用だけがそれに従う（Before/After 並びの 66vw 用）", () => {
    render(
      <PostDetailHeroImage
        displayUrl={DISPLAY}
        thumbnailUrl={THUMB}
        alt="うちの子"
        displaySizes="(max-width: 768px) 66vw, 66vw"
      />
    );

    expect(imgs()[1].getAttribute("sizes")).toBe("(max-width: 768px) 66vw, 66vw");
    // サムネ側は unoptimized なので sizes を変えても URL は変わらない（＝キャッシュに当たる）
    expect(imgs()[0].getAttribute("sizes")).toBe(
      `(max-width: ${FEED_CARD_MAX_WIDTH_PX}px) 100vw, ${FEED_CARD_MAX_WIDTH_PX}px`
    );
    expect(imgs()[0].getAttribute("data-unoptimized")).toBe("true");
  });

  test("className は両方の layer に付く（比率・最大高の指定を落とさない）", () => {
    render(
      <PostDetailHeroImage
        displayUrl={DISPLAY}
        thumbnailUrl={THUMB}
        alt="うちの子"
        className="max-h-[50vh] object-contain"
      />
    );

    for (const img of imgs()) {
      expect(img.className).toContain("max-h-[50vh]");
      expect(img.className).toContain("object-contain");
    }
  });
});
