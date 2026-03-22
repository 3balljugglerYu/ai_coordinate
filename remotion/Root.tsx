import {Composition, Folder} from "remotion";
import {
  PERSTA_INTRO_VIDEO_DURATION_IN_FRAMES,
  PERSTA_INTRO_VIDEO_FPS,
  PERSTA_INTRO_VIDEO_HEIGHT,
  PERSTA_INTRO_VIDEO_WIDTH,
  PerstaIntroVideo,
  perstaI2IShowcaseDefaults,
  perstaI2IShowcaseDefaultsEn,
} from "./videos/persta-i2i-showcase";
import {
  ONE_TAP_STYLE_PROMO_DURATION_IN_FRAMES,
  ONE_TAP_STYLE_PROMO_FPS,
  ONE_TAP_STYLE_PROMO_HEIGHT,
  ONE_TAP_STYLE_PROMO_WIDTH,
  OneTapStylePromoVideo,
  oneTapStylePromoDefaultsChooseOnly,
  oneTapStylePromoDefaultsOneTap,
  oneTapStylePromoDefaultsZeroPrompt,
} from "./videos/one-tap-style";

export const RemotionRoot = () => {
  return (
    <Folder name="marketing">
      <Composition
        id="PerstaIntroVideo"
        component={PerstaIntroVideo}
        durationInFrames={PERSTA_INTRO_VIDEO_DURATION_IN_FRAMES}
        fps={PERSTA_INTRO_VIDEO_FPS}
        width={PERSTA_INTRO_VIDEO_WIDTH}
        height={PERSTA_INTRO_VIDEO_HEIGHT}
        defaultProps={perstaI2IShowcaseDefaults}
      />
      <Composition
        id="PerstaIntroVideoEn"
        component={PerstaIntroVideo}
        durationInFrames={PERSTA_INTRO_VIDEO_DURATION_IN_FRAMES}
        fps={PERSTA_INTRO_VIDEO_FPS}
        width={PERSTA_INTRO_VIDEO_WIDTH}
        height={PERSTA_INTRO_VIDEO_HEIGHT}
        defaultProps={perstaI2IShowcaseDefaultsEn}
      />
      <Composition
        id="OneTapStylePromoZeroPrompt"
        component={OneTapStylePromoVideo}
        durationInFrames={ONE_TAP_STYLE_PROMO_DURATION_IN_FRAMES}
        fps={ONE_TAP_STYLE_PROMO_FPS}
        width={ONE_TAP_STYLE_PROMO_WIDTH}
        height={ONE_TAP_STYLE_PROMO_HEIGHT}
        defaultProps={oneTapStylePromoDefaultsZeroPrompt}
      />
      <Composition
        id="OneTapStylePromoOneTap"
        component={OneTapStylePromoVideo}
        durationInFrames={ONE_TAP_STYLE_PROMO_DURATION_IN_FRAMES}
        fps={ONE_TAP_STYLE_PROMO_FPS}
        width={ONE_TAP_STYLE_PROMO_WIDTH}
        height={ONE_TAP_STYLE_PROMO_HEIGHT}
        defaultProps={oneTapStylePromoDefaultsOneTap}
      />
      <Composition
        id="OneTapStylePromoChooseOnly"
        component={OneTapStylePromoVideo}
        durationInFrames={ONE_TAP_STYLE_PROMO_DURATION_IN_FRAMES}
        fps={ONE_TAP_STYLE_PROMO_FPS}
        width={ONE_TAP_STYLE_PROMO_WIDTH}
        height={ONE_TAP_STYLE_PROMO_HEIGHT}
        defaultProps={oneTapStylePromoDefaultsChooseOnly}
      />
    </Folder>
  );
};
