import {spring, useCurrentFrame, useVideoConfig} from "remotion";
import {palette} from "../config";
import {fadeIn, riseIn, scaleIn} from "../helpers";
import {
  BrandLockup,
  FloatingResultCard,
  SceneBackground,
  ValueBadge,
} from "../shared";
import type {OneTapStylePromoCopy} from "../types";

export const IntroScene = ({
  copy,
  appIconUrl,
  mainImageUrl,
}: {
  copy: OneTapStylePromoCopy;
  appIconUrl: string;
  mainImageUrl: string;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const brandProgress = spring({frame, fps, config: {damping: 180}});
  const copyProgress = spring({
    frame: frame - 8,
    fps,
    config: {damping: 170},
  });
  const cardProgress = spring({
    frame: frame - 18,
    fps,
    config: {damping: 165},
  });

  return (
    <SceneBackground imageUrl={mainImageUrl} imageOpacity={0.18}>
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 58,
          opacity: brandProgress,
          transform: `translateY(${(1 - brandProgress) * 22}px)`,
        }}
      >
        <BrandLockup iconUrl={appIconUrl} caption={copy.brandCaption} />
      </div>

      <ValueBadge
        label={copy.valueBadge}
        accent={palette.sky}
        style={{
          position: "absolute",
          right: 70,
          top: 62,
          opacity: fadeIn(frame, 8, 14),
          transform: `translateY(${riseIn(frame, 8, 18)}px) scale(${scaleIn(frame, 8, 0.96)})`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 78,
          top: 188,
          width: 760,
          zIndex: 2,
          opacity: copyProgress,
          transform: `translateY(${(1 - copyProgress) * 30}px)`,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "12px 18px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.84)",
            border: "1px solid rgba(32,48,77,0.08)",
            marginBottom: 24,
            fontSize: 20,
            lineHeight: 1,
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: palette.muted,
          }}
        >
          {copy.heroLabel}
        </div>
        <div
          style={{
            marginBottom: 24,
            fontSize: 102,
            lineHeight: 0.94,
            fontWeight: 900,
            letterSpacing: "-0.08em",
            whiteSpace: "nowrap",
          }}
        >
          {copy.heroHeadline}
        </div>
        <div
          style={{
            maxWidth: 640,
            fontSize: 34,
            lineHeight: 1.38,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: palette.muted,
          }}
        >
          {copy.heroBody}
        </div>
      </div>

      <FloatingResultCard
        imageUrl={mainImageUrl}
        label={copy.heroCardLabel}
        style={{
          position: "absolute",
          right: 72,
          top: 146,
          width: 920,
          height: 690,
          opacity: cardProgress,
          transform: `translateY(${(1 - cardProgress) * 38}px) scale(${0.95 + cardProgress * 0.05}) rotate(-2deg)`,
        }}
      />
    </SceneBackground>
  );
};
