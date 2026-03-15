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
    </Folder>
  );
};
