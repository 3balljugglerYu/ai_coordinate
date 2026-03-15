import {TransitionSeries, linearTiming, springTiming} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import {slide} from "@remotion/transitions/slide";
import {AbsoluteFill, staticFile} from "remotion";
import {
  BASE_DURATION_IN_FRAMES,
  CTA_DURATION_IN_FRAMES,
  INTRO_DURATION_IN_FRAMES,
  RESULT_DURATION_IN_FRAMES,
  SWAP_DURATION_IN_FRAMES,
  TRANSITION_DURATION_IN_FRAMES,
  palette,
} from "./config";
import {BaseScene} from "./scenes/BaseScene";
import {CtaScene} from "./scenes/CtaScene";
import {IntroScene} from "./scenes/IntroScene";
import {ResultScene} from "./scenes/ResultScene";
import {SwapScene} from "./scenes/SwapScene";
import type {PerstaIntroVideoProps} from "./types";

export {
  PERSTA_INTRO_VIDEO_DURATION_IN_FRAMES,
  PERSTA_INTRO_VIDEO_FPS,
  PERSTA_INTRO_VIDEO_HEIGHT,
  PERSTA_INTRO_VIDEO_WIDTH,
} from "./config";
export type {PerstaIntroVideoProps} from "./types";

export const PerstaIntroVideo = ({
  featureBadge,
  title,
  introHeadline,
  introBody,
  baseSceneMessage,
  baseSceneBody,
  swapSceneMessage,
  lockedMessage,
  resultSceneMessage,
  resultSceneBody,
  betaBadge,
  ctaTitle,
  ctaBody,
  ctaButtonLabel,
  mainImageSrc,
  baseImageSrc,
  characterImageSrc,
  resultImageSrc,
}: PerstaIntroVideoProps) => {
  const mainImageUrl = staticFile(mainImageSrc);
  const baseImageUrl = staticFile(baseImageSrc);
  const characterImageUrl = staticFile(characterImageSrc);
  const resultImageUrl = staticFile(resultImageSrc);

  return (
    <AbsoluteFill style={{background: palette.ink}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={INTRO_DURATION_IN_FRAMES}>
          <IntroScene
            featureBadge={featureBadge}
            title={title}
            introHeadline={introHeadline}
            introBody={introBody}
            mainImageUrl={mainImageUrl}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({durationInFrames: TRANSITION_DURATION_IN_FRAMES})}
        />

        <TransitionSeries.Sequence durationInFrames={BASE_DURATION_IN_FRAMES}>
          <BaseScene
            message={baseSceneMessage}
            body={baseSceneBody}
            baseImageUrl={baseImageUrl}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({direction: "from-right"})}
          timing={springTiming({
            durationInFrames: TRANSITION_DURATION_IN_FRAMES,
            config: {damping: 200},
          })}
        />

        <TransitionSeries.Sequence durationInFrames={SWAP_DURATION_IN_FRAMES}>
          <SwapScene
            message={swapSceneMessage}
            lockedMessage={lockedMessage}
            baseImageUrl={baseImageUrl}
            characterImageUrl={characterImageUrl}
            resultImageUrl={resultImageUrl}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({direction: "from-bottom"})}
          timing={springTiming({
            durationInFrames: TRANSITION_DURATION_IN_FRAMES,
            config: {damping: 210},
          })}
        />

        <TransitionSeries.Sequence durationInFrames={RESULT_DURATION_IN_FRAMES}>
          <ResultScene
            message={resultSceneMessage}
            body={resultSceneBody}
            baseImageUrl={baseImageUrl}
            characterImageUrl={characterImageUrl}
            resultImageUrl={resultImageUrl}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({durationInFrames: TRANSITION_DURATION_IN_FRAMES})}
        />

        <TransitionSeries.Sequence durationInFrames={CTA_DURATION_IN_FRAMES}>
          <CtaScene
            betaBadge={betaBadge}
            ctaTitle={ctaTitle}
            ctaBody={ctaBody}
            ctaButtonLabel={ctaButtonLabel}
            mainImageUrl={mainImageUrl}
            resultImageUrl={resultImageUrl}
          />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
