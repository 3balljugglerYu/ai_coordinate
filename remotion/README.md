# Remotion Guide

このディレクトリは、Persta.AI の動画コンテンツを Remotion で管理するための入口です。

## 最初に見るファイル

- `index.ts`
  Remotion のエントリポイント。通常は触らない。
- `Root.tsx`
  Remotion Studio に表示する `Composition` の登録場所。
- `videos/`
  動画ごとの実装本体。

## ディレクトリ構成

```text
remotion/
  index.ts
  Root.tsx
  README.md
  videos/
    README.md
    <video-id>/
      Composition.tsx
      config.ts
      defaults.ts
      helpers.ts
      index.ts
      shared.tsx
      types.ts
      scenes/
        IntroScene.tsx
        BaseScene.tsx
        ...
public/
  remotion/
    <video-id>/
      ...
```

## 役割

- `Root.tsx`
  どの動画を Remotion で扱うかを登録する。
- `videos/<video-id>/Composition.tsx`
  シーン接続と全体のタイムラインを持つ。
- `videos/<video-id>/scenes/`
  シーン単位の UI と演出を分ける。
- `videos/<video-id>/defaults.ts`
  文言や画像パスなど、動画固有の `defaultProps` を置く。
- `public/remotion/<video-id>/`
  その動画専用の素材を置く。

## 新しい動画を作る手順

1. `remotion/videos/` 配下に新しい `video-id` ディレクトリを作る。
2. 既存動画をベースにするなら、`remotion/videos/persta-i2i-showcase/` をコピーする。
3. 複製した直後に、export 名と `Composition` の `id` に使う名前を決める。
4. `public/remotion/<video-id>/` を作って素材を入れる。
5. `defaults.ts` の文言と画像パスを更新する。
6. `scenes/` 配下のシーンを用途に合わせて編集する。
7. `Composition.tsx` でシーンの順番、transition、尺を調整する。
8. `Root.tsx` に `Composition` を追加する。

## 複製後に必ず決める命名

- `videos/<video-id>/Composition.tsx` のコンポーネント名
  例: `PerstaFeatureXVideo`
- `videos/<video-id>/defaults.ts` の defaultProps 名
  例: `perstaFeatureXDefaults`
- `Root.tsx` で登録する `Composition` の `id`
  例: `PerstaFeatureXVideo`

`Composition` の `id` は Remotion 全体で一意である必要があります。既存動画をコピーしたまま `PerstaIntroVideo` を使い回すと、Studio と render のどちらでも区別できなくなります。

例:

```tsx
import {
  PerstaFeatureXVideo,
  perstaFeatureXDefaults,
  PERSTA_FEATURE_X_DURATION_IN_FRAMES,
  PERSTA_FEATURE_X_FPS,
  PERSTA_FEATURE_X_WIDTH,
  PERSTA_FEATURE_X_HEIGHT,
} from "./videos/persta-feature-x";

<Composition
  id="PerstaFeatureXVideo"
  component={PerstaFeatureXVideo}
  durationInFrames={PERSTA_FEATURE_X_DURATION_IN_FRAMES}
  fps={PERSTA_FEATURE_X_FPS}
  width={PERSTA_FEATURE_X_WIDTH}
  height={PERSTA_FEATURE_X_HEIGHT}
  defaultProps={perstaFeatureXDefaults}
/>
```

## 新しい動画を作る時に主に触る場所

- 動画タイトルやCTA文言を変える
  `videos/<video-id>/defaults.ts`
- 素材を差し替える
  `public/remotion/<video-id>/` と `videos/<video-id>/defaults.ts`
- 各シーンの見た目を変える
  `videos/<video-id>/scenes/*.tsx`
- シーン配分や transition を変える
  `videos/<video-id>/config.ts` と `videos/<video-id>/Composition.tsx`
- 共通 UI を足す
  `videos/<video-id>/shared.tsx`

## 開発コマンド

- Studio を開く

```bash
npm run video:studio
```

- 現在のサンプル動画を書き出す

```bash
npm run video:render
```

- 任意の Composition を指定して書き出す

```bash
npm run video:render:composition -- <CompositionId> out/videos/<file-name>.mp4
```

例:

```bash
npm run video:render:composition -- PerstaIntroVideo out/videos/persta-ai-intro.mp4
```

## 注意点

- 画像や動画素材は `public/` 配下に置き、`staticFile()` で参照する。
- 動画ファイルの出力先 `out/` は `.gitignore` 対象。生成 mp4 は通常 push しない。
- 新しい動画を追加したときは、`npm run video:render` ではなく `npm run video:render:composition -- <CompositionId> ...` を使うか、`package.json` に専用 script を追加する。
- 新しい動画を複製した直後は、`Composition` 名、defaultProps 名、`Composition id` を先に決めてから実装を始める。
- ルールの詳細は `videos/README.md` を参照する。
