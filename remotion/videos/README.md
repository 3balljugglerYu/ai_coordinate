# Remotion Videos

この README は `remotion/videos/` 配下の詳細ルールです。  
入口と全体像は `../README.md` を先に見てください。

## 1動画あたりの基本構成

各動画は `remotion/videos/<video-id>/` にまとめる。

- `Composition.tsx`
  その動画のタイムライン本体。シーンをどう接続するかだけを持つ。
- `config.ts`
  fps、サイズ、各シーン尺、共通カラーなどの設定。
- `defaults.ts`
  `defaultProps`。文言や素材パスをまとめる。
- `helpers.ts`
  アニメーション計算などの小さな共通関数。
- `shared.tsx`
  その動画内で使い回す UI パーツ。
- `types.ts`
  props 型定義。
- `scenes/`
  シーン単位のコンポーネント群。
- `index.ts`
  `Root.tsx` から読む公開エントリ。

## 実装の進め方

新しい動画を作るときは、以下の順で進めると迷いにくいです。

1. `video-id` を決める
   例: `persta-feature-x`
2. `remotion/videos/persta-i2i-showcase/` を複製して新しい `video-id` にする
3. 複製したファイル内の命名を新しい動画用に変える
   `Composition.tsx` のコンポーネント名、`defaults.ts` の defaultProps 名、`index.ts` の export を揃える
4. `public/remotion/<video-id>/` を作り、素材を配置する
5. `defaults.ts` を編集し、文言と素材パスを差し替える
6. `config.ts` で動画サイズ、fps、各シーン尺を決める
7. `scenes/` 配下で各シーンを作る
8. `Composition.tsx` でシーン順、transition、全体の見せ方を組み立てる
9. `Root.tsx` に `Composition` を登録する
10. `npm run video:studio` で確認する
11. `npm run video:render:composition -- <CompositionId> out/videos/<file-name>.mp4` で最終書き出しする

例:

```bash
npm run video:render:composition -- PerstaIntroVideo out/videos/persta-ai-intro.mp4
```

## 複製後の命名ルール

複製元の名前を残したまま実装を始めると、後で `Root.tsx` と render コマンドで混乱しやすいです。複製直後に次の3点を先に決めてください。

- コンポーネント名
  例: `PerstaFeatureXVideo`
- defaultProps 名
  例: `perstaFeatureXDefaults`
- `Composition` の `id`
  例: `PerstaFeatureXVideo`

特に `Composition` の `id` は Remotion 全体で一意にする必要があります。同じ `id` を複数動画で使うと、Studio 上の識別と render 対象の指定が壊れます。

`Root.tsx` 登録例:

```tsx
import {
  PerstaFeatureXVideo,
  perstaFeatureXDefaults,
  PERSTA_FEATURE_X_DURATION_IN_FRAMES,
  PERSTA_FEATURE_X_FPS,
  PERSTA_FEATURE_X_WIDTH,
  PERSTA_FEATURE_X_HEIGHT,
} from "./persta-feature-x";

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

## 迷ったときの判断基準

- 文言だけ変えたい
  `defaults.ts`
- 画像差し替えだけしたい
  `public/remotion/<video-id>/` と `defaults.ts`
- シーンのレイアウトを変えたい
  `scenes/*.tsx`
- 共通カードや共通見出しを追加したい
  `shared.tsx`
- 尺や transition を変えたい
  `config.ts` と `Composition.tsx`
- 新しい動画を書き出したい
  `npm run video:render:composition -- <CompositionId> out/videos/<file-name>.mp4`
- 複製後にまず何を直すか迷う
  export 名、defaultProps 名、`Composition id` を先に一意化する

## 運用ルール

- 動画固有のものは、できるだけその `video-id` ディレクトリ内に閉じる。
- 別動画でも再利用しそうなものでも、最初はその動画内に置く。
  本当に複数動画で使うと確定した時だけ `remotion/shared/` のような共通化を検討する。
- 素材は `public/remotion/<video-id>/` に寄せる。
- 生成動画は `out/` 配下に出すだけにして、通常は Git に含めない。
- `Root.tsx` に登録する `Composition id` は動画ごとに重複させない。
