import {spring, useCurrentFrame, useVideoConfig, interpolate} from "remotion";
import {clamp, palette} from "../config";
import {float} from "../helpers";
import {BrandBadge, SceneBackground, ShowcaseCard} from "../shared";

export const SwapScene = ({
  message,
  lockedMessage,
  baseImageUrl,
  characterImageUrl,
  resultImageUrl,
}: {
  message: string;
  lockedMessage: string;
  baseImageUrl: string;
  characterImageUrl: string;
  resultImageUrl: string;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const headerProgress = spring({frame, fps, config: {damping: 190}});
  const leftProgress = spring({
    frame: frame - Math.floor(fps * 0.1),
    fps,
    config: {damping: 170},
  });
  const centerProgress = spring({
    frame: frame - Math.floor(fps * 0.18),
    fps,
    config: {damping: 160},
  });
  const rightProgress = spring({
    frame: frame - Math.floor(fps * 0.28),
    fps,
    config: {damping: 150},
  });
  const arrowPulse = 1 + interpolate(frame, [0, 30, 60], [0, 0.05, 0], clamp);

  return (
    <SceneBackground accentA={palette.rose} accentB={palette.blue} accentC={palette.cyan}>
      <div
        style={{
          position: "absolute",
          top: 96,
          left: 84,
          right: 84,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            width: 760,
            opacity: headerProgress,
            transform: `translateY(${(1 - headerProgress) * 32}px)`,
          }}
        >
          <div
            style={{
              fontSize: 24,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: palette.rose,
              marginBottom: 16,
            }}
          >
            Scene 2 / Swap
          </div>
          <div
            style={{
              fontSize: 72,
              lineHeight: 0.95,
              fontWeight: 700,
              letterSpacing: "-0.07em",
              marginBottom: 16,
            }}
          >
            {message}
          </div>
          <div
            style={{
              fontSize: 26,
              lineHeight: 1.48,
              color: palette.muted,
            }}
          >
            {lockedMessage}
          </div>
        </div>

        <div
          style={{
            opacity: headerProgress,
            transform: `translateY(${(1 - headerProgress) * 22}px)`,
          }}
        >
          <BrandBadge />
        </div>
      </div>

      <ShowcaseCard
        src={baseImageUrl}
        label="Base scene"
        caption="背景・服装・ポーズはこのまま"
        style={{
          left: 84,
          top: 332 + float(frame, 22, 6, 0),
          width: 600,
          height: 600,
          opacity: leftProgress,
          transform: `translateY(${(1 - leftProgress) * 52}px) scale(${0.95 + leftProgress * 0.05})`,
        }}
      />

      <ShowcaseCard
        src={characterImageUrl}
        label="My character"
        caption="差し替え元のキャラクター"
        style={{
          left: 730,
          top: 332 + float(frame, 22, 6, 10),
          width: 360,
          height: 590,
          opacity: centerProgress,
          transform: `translateY(${(1 - centerProgress) * 52}px) scale(${0.95 + centerProgress * 0.05})`,
        }}
      />

      <ShowcaseCard
        src={resultImageUrl}
        label="Generated result"
        caption="生成結果"
        style={{
          right: 84,
          top: 300 + float(frame, 22, 6, 20),
          width: 720,
          height: 640,
          opacity: rightProgress,
          transform: `translateY(${(1 - rightProgress) * 52}px) scale(${0.95 + rightProgress * 0.05})`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 690,
          top: 562,
          width: 34,
          height: 18,
          borderRadius: 999,
          background:
            "linear-gradient(90deg, rgba(140,240,255,0) 0%, rgba(140,240,255,0.92) 48%, rgba(140,240,255,0) 100%)",
          transform: `scale(${arrowPulse})`,
          filter: "blur(2px)",
          opacity: 0.92,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 1098,
          top: 560,
          width: 24,
          height: 18,
          borderRadius: 999,
          background:
            "linear-gradient(90deg, rgba(255,217,123,0) 0%, rgba(255,217,123,0.96) 48%, rgba(255,217,123,0) 100%)",
          transform: `scale(${arrowPulse})`,
          filter: "blur(2px)",
          opacity: 0.92,
        }}
      />
    </SceneBackground>
  );
};
