import {spring, useCurrentFrame, useVideoConfig} from "remotion";
import {palette} from "../config";
import {fadeIn, float, riseIn} from "../helpers";
import {SceneBackground, ShowcaseCard, Tag} from "../shared";

export const BaseScene = ({
  eyebrow,
  message,
  body,
  cardLabel,
  cardCaption,
  backgroundTagLabel,
  outfitTagLabel,
  poseTagLabel,
  baseImageUrl,
}: {
  eyebrow: string;
  message: string;
  body: string;
  cardLabel: string;
  cardCaption: string;
  backgroundTagLabel: string;
  outfitTagLabel: string;
  poseTagLabel: string;
  baseImageUrl: string;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const copyProgress = spring({frame, fps, config: {damping: 190}});
  const cardProgress = spring({
    frame: frame - Math.floor(fps * 0.15),
    fps,
    config: {damping: 170},
  });

  return (
    <SceneBackground accentA={palette.blue} accentB={palette.gold} accentC={palette.cyan}>
      <div
        style={{
          position: "absolute",
          left: 84,
          top: 134,
          width: 620,
          opacity: copyProgress,
          transform: `translateY(${(1 - copyProgress) * 34}px)`,
        }}
      >
        <div
          style={{
            fontSize: 24,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: palette.cyan,
            marginBottom: 18,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            fontSize: 78,
            lineHeight: 0.96,
            fontWeight: 700,
            letterSpacing: "-0.07em",
            marginBottom: 18,
          }}
        >
          {message}
        </div>
        <div
          style={{
            fontSize: 26,
            lineHeight: 1.5,
            color: palette.muted,
            maxWidth: 560,
          }}
        >
          {body}
        </div>
      </div>

      <ShowcaseCard
        src={baseImageUrl}
        label={cardLabel}
        caption={cardCaption}
        style={{
          right: 84,
          top: 150 + float(frame, 28, 8, 8),
          width: 980,
          height: 720,
          opacity: cardProgress,
          transform: `translateY(${(1 - cardProgress) * 56}px) scale(${0.95 + cardProgress * 0.05})`,
        }}
      />

      <Tag
        label={backgroundTagLabel}
        accent={palette.cyan}
        style={{
          left: 86,
          bottom: 180 + riseIn(frame, 10, 12),
          opacity: fadeIn(frame, 10, 16),
        }}
      />
      <Tag
        label={outfitTagLabel}
        accent={palette.mint}
        style={{
          left: 298,
          bottom: 180 + riseIn(frame, 18, 12),
          opacity: fadeIn(frame, 18, 16),
        }}
      />
      <Tag
        label={poseTagLabel}
        accent={palette.gold}
        style={{
          left: 490,
          bottom: 180 + riseIn(frame, 26, 12),
          opacity: fadeIn(frame, 26, 16),
        }}
      />
    </SceneBackground>
  );
};
