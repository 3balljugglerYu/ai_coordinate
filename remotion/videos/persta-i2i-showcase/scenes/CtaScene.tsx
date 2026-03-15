import {AbsoluteFill, Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";
import {clamp, fontFamily, palette} from "../config";
import {float} from "../helpers";
import {BrandBadge, GlassPanel, ShowcaseCard} from "../shared";

export const CtaScene = ({
  betaBadge,
  ctaTitle,
  ctaBody,
  ctaButtonLabel,
  previewLabel,
  mainImageUrl,
  resultImageUrl,
}: {
  betaBadge: string;
  ctaTitle: string;
  ctaBody: string;
  ctaButtonLabel: string;
  previewLabel: string;
  mainImageUrl: string;
  resultImageUrl: string;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cardProgress = spring({frame, fps, config: {damping: 180}});
  const buttonGlow = interpolate(frame, [0, fps], [0.72, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.ease),
  });

  return (
    <AbsoluteFill
      style={{
        background: palette.ink,
        color: palette.text,
        fontFamily,
        overflow: "hidden",
      }}
    >
      <Img
        src={mainImageUrl}
        style={{
          position: "absolute",
          inset: -100,
          width: "calc(100% + 200px)",
          height: "calc(100% + 200px)",
          objectFit: "cover",
          filter: "blur(24px) brightness(0.46) saturate(1.08)",
          transform: `scale(${1.05 + frame * 0.0005})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(5,8,22,0.42) 0%, rgba(5,8,22,0.76) 48%, rgba(5,8,22,0.92) 100%)",
        }}
      />

      <ShowcaseCard
        src={resultImageUrl}
        label={previewLabel}
        style={{
          left: 92,
          top: 210 + float(frame, 28, 6, 0),
          width: 700,
          height: 500,
          opacity: cardProgress,
          transform: `translateY(${(1 - cardProgress) * 40}px) scale(${0.96 + cardProgress * 0.04})`,
        }}
      />

      <GlassPanel
        style={{
          right: 92,
          top: 170,
          width: 900,
          height: 620,
          opacity: cardProgress,
          transform: `translateY(${(1 - cardProgress) * 42}px) scale(${0.96 + cardProgress * 0.04})`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 34,
            left: 34,
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 18px",
            borderRadius: 999,
            background: "rgba(7, 12, 24, 0.76)",
            border: "1px solid rgba(255,255,255,0.14)",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: palette.cyan,
          }}
        >
          {betaBadge}
        </div>
        <div
          style={{
            position: "absolute",
            top: 34,
            right: 34,
          }}
        >
          <BrandBadge />
        </div>
        <div
          style={{
            position: "absolute",
            left: 42,
            right: 42,
            top: 170,
          }}
        >
          <div
            style={{
              fontSize: 84,
              lineHeight: 0.94,
              fontWeight: 700,
              letterSpacing: "-0.08em",
              marginBottom: 22,
            }}
          >
            {ctaTitle}
          </div>
          <div
            style={{
              maxWidth: 720,
              fontSize: 28,
              lineHeight: 1.5,
              color: palette.muted,
            }}
          >
            {ctaBody}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 42,
            bottom: 50,
            width: 470,
            height: 92,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "linear-gradient(90deg, rgba(46,98,255,0.96) 0%, rgba(140,240,255,0.96) 100%)",
            color: palette.ink,
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            boxShadow: `0 18px 52px rgba(140,240,255,${0.3 * buttonGlow})`,
          }}
        >
          {ctaButtonLabel}
        </div>
      </GlassPanel>
    </AbsoluteFill>
  );
};
