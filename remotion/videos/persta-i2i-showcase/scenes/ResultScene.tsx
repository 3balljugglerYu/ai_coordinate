import {spring, useCurrentFrame, useVideoConfig} from "remotion";
import {palette} from "../config";
import {float, scaleIn} from "../helpers";
import {SceneBackground, ShowcaseCard} from "../shared";

export const ResultScene = ({
  eyebrow,
  message,
  body,
  resultLabel,
  resultCaption,
  baseLabel,
  characterLabel,
  baseImageUrl,
  characterImageUrl,
  resultImageUrl,
}: {
  eyebrow: string;
  message: string;
  body: string;
  resultLabel: string;
  resultCaption: string;
  baseLabel: string;
  characterLabel: string;
  baseImageUrl: string;
  characterImageUrl: string;
  resultImageUrl: string;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const resultProgress = spring({frame, fps, config: {damping: 180}});
  const copyProgress = spring({
    frame: frame - Math.floor(fps * 0.18),
    fps,
    config: {damping: 200},
  });

  return (
    <SceneBackground accentA={palette.gold} accentB={palette.rose} accentC={palette.cyan}>
      <ShowcaseCard
        src={resultImageUrl}
        label={resultLabel}
        caption={resultCaption}
        style={{
          left: 84,
          top: 140 + float(frame, 28, 6, 8),
          width: 1020,
          height: 760,
          opacity: resultProgress,
          transform: `translateY(${(1 - resultProgress) * 54}px) scale(${0.95 + resultProgress * 0.05})`,
        }}
      />

      <div
        style={{
          position: "absolute",
          right: 92,
          top: 170,
          width: 640,
          opacity: copyProgress,
          transform: `translateY(${(1 - copyProgress) * 34}px)`,
        }}
      >
        <div
          style={{
            fontSize: 24,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: palette.gold,
            marginBottom: 14,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            fontSize: 74,
            lineHeight: 0.98,
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
            marginBottom: 28,
          }}
        >
          {body}
        </div>
      </div>

      <ShowcaseCard
        src={baseImageUrl}
        label={baseLabel}
        style={{
          right: 420,
          bottom: 128 + float(frame, 24, 4, 0),
          width: 260,
          height: 240,
          opacity: copyProgress,
          transform: `translateY(${(1 - copyProgress) * 28}px) scale(${scaleIn(frame, 12)})`,
        }}
      />
      <ShowcaseCard
        src={characterImageUrl}
        label={characterLabel}
        style={{
          right: 92,
          bottom: 128 + float(frame, 24, 4, 10),
          width: 280,
          height: 240,
          opacity: copyProgress,
          transform: `translateY(${(1 - copyProgress) * 28}px) scale(${scaleIn(frame, 18)})`,
        }}
      />
    </SceneBackground>
  );
};
