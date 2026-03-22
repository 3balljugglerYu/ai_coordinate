import {TransitionSeries, linearTiming, springTiming} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import {slide} from "@remotion/transitions/slide";
import {AbsoluteFill, staticFile} from "remotion";
import {
  TRANSITION_DURATION_IN_FRAMES,
  palette,
  sceneDurationsInFrames,
} from "./config";
import {CharacterPickScene} from "./scenes/CharacterPickScene";
import {CinematicTitleScene} from "./scenes/CinematicTitleScene";
import {GenerateScene} from "./scenes/GenerateScene";
import {IntroScene} from "./scenes/IntroScene";
import {RevealScene} from "./scenes/RevealScene";
import {StylePickScene} from "./scenes/StylePickScene";
import type {
  OneTapStylePromoProps,
  OneTapStylePromoResolvedStyleOption,
} from "./types";

export {
  ONE_TAP_STYLE_PROMO_DURATION_IN_FRAMES,
  ONE_TAP_STYLE_PROMO_FPS,
  ONE_TAP_STYLE_PROMO_HEIGHT,
  ONE_TAP_STYLE_PROMO_WIDTH,
} from "./config";
export type {OneTapStylePromoProps} from "./types";

export const OneTapStylePromoVideo = ({
  copy,
  assets,
}: OneTapStylePromoProps) => {
  const mainImageUrl = staticFile(assets.mainImageSrc);
  const resultImageUrl = staticFile(assets.resultImageSrc);
  const characterImageUrl = staticFile(assets.characterImageSrc);
  const appIconUrl = staticFile(assets.appIconSrc);

  const styleOptions: readonly OneTapStylePromoResolvedStyleOption[] =
    assets.styleOptions.map((styleOption) => ({
      id: styleOption.id,
      name: styleOption.name,
      accent: styleOption.accent,
      imageUrl: staticFile(styleOption.imageSrc),
    }));

  const selectedStyle =
    styleOptions.find((styleOption) => styleOption.id === assets.selectedStyleId) ??
    styleOptions[0];

  if (!selectedStyle) {
    throw new Error("At least one style option is required for OneTapStylePromoVideo.");
  }

  return (
    <AbsoluteFill style={{background: palette.canvas}}>
      <TransitionSeries>
        <TransitionSeries.Sequence
          durationInFrames={sceneDurationsInFrames.cinematicTitle1}
        >
          <CinematicTitleScene text={copy.cinematicTitle1} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({durationInFrames: TRANSITION_DURATION_IN_FRAMES})}
        />

        <TransitionSeries.Sequence
          durationInFrames={sceneDurationsInFrames.cinematicTitle2}
        >
          <CinematicTitleScene text={copy.cinematicTitle2} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({durationInFrames: TRANSITION_DURATION_IN_FRAMES})}
        />

        <TransitionSeries.Sequence
          durationInFrames={sceneDurationsInFrames.intro}
        >
          <IntroScene
            copy={copy}
            appIconUrl={appIconUrl}
            mainImageUrl={mainImageUrl}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({durationInFrames: TRANSITION_DURATION_IN_FRAMES})}
        />

        <TransitionSeries.Sequence
          durationInFrames={sceneDurationsInFrames.stylePick}
        >
          <StylePickScene
            copy={copy}
            styleOptions={styleOptions}
            selectedStyleId={selectedStyle.id}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({direction: "from-right"})}
          timing={springTiming({
            durationInFrames: TRANSITION_DURATION_IN_FRAMES,
            config: {damping: 220},
          })}
        />

        <TransitionSeries.Sequence
          durationInFrames={sceneDurationsInFrames.characterPick}
        >
          <CharacterPickScene
            copy={copy}
            selectedStyle={selectedStyle}
            characterImageUrl={characterImageUrl}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({direction: "from-bottom"})}
          timing={springTiming({
            durationInFrames: TRANSITION_DURATION_IN_FRAMES,
            config: {damping: 220},
          })}
        />

        <TransitionSeries.Sequence
          durationInFrames={sceneDurationsInFrames.generate}
        >
          <GenerateScene
            copy={copy}
            selectedStyle={selectedStyle}
            characterImageUrl={characterImageUrl}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({durationInFrames: TRANSITION_DURATION_IN_FRAMES})}
        />

        <TransitionSeries.Sequence
          durationInFrames={sceneDurationsInFrames.reveal}
        >
          <RevealScene
            copy={copy}
            appIconUrl={appIconUrl}
            characterImageUrl={characterImageUrl}
            resultImageUrl={resultImageUrl}
            selectedStyle={selectedStyle}
            mainImageUrl={mainImageUrl}
          />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
