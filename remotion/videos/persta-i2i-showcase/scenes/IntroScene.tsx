import {spring, useCurrentFrame, useVideoConfig} from "remotion";
import {palette} from "../config";
import {float} from "../helpers";
import {
  BrandBadge,
  HeadlineReveal,
  SceneBackground,
  ShowcaseCard,
  Tag,
} from "../shared";

export const IntroScene = ({
  featureBadge,
  title,
  introHeadline,
  introBody,
  mainImageUrl,
}: {
  featureBadge: string;
  title: string;
  introHeadline: string;
  introBody: string;
  mainImageUrl: string;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const brandProgress = spring({frame, fps, config: {damping: 200}});
  const copyProgress = spring({
    frame: frame - Math.floor(fps * 0.16),
    fps,
    config: {damping: 170},
  });
  const imageProgress = spring({
    frame: frame - Math.floor(fps * 0.34),
    fps,
    config: {damping: 160},
  });

  return (
    <SceneBackground accentA={palette.blue} accentB={palette.rose} accentC={palette.cyan}>
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 70,
          opacity: brandProgress,
          transform: `translateY(${(1 - brandProgress) * 24}px)`,
        }}
      >
        <BrandBadge />
      </div>

      <div
        style={{
          position: "absolute",
          left: 84,
          top: 186,
          width: 730,
          opacity: copyProgress,
          transform: `translateY(${(1 - copyProgress) * 36}px)`,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            marginBottom: 22,
            padding: "12px 18px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(8, 14, 28, 0.56)",
            color: palette.cyan,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          {featureBadge}
        </div>
        <HeadlineReveal
          text={title}
          start={6}
          duration={28}
          style={{
            fontSize: 108,
            lineHeight: 0.92,
            fontWeight: 700,
            letterSpacing: "-0.08em",
            marginBottom: 22,
            background:
              "linear-gradient(180deg, #ffffff 0%, #dfe8ff 26%, #8cf0ff 100%)",
            color: "transparent",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
          }}
        />
        <div
          style={{
            fontSize: 40,
            lineHeight: 1.15,
            letterSpacing: "-0.04em",
            fontWeight: 600,
            marginBottom: 20,
          }}
        >
          {introHeadline}
        </div>
        <div
          style={{
            maxWidth: 660,
            fontSize: 25,
            lineHeight: 1.5,
            color: palette.muted,
          }}
        >
          {introBody}
        </div>
      </div>

      <ShowcaseCard
        src={mainImageUrl}
        style={{
          right: 86,
          top: 136 + float(frame, 28, 8, 20),
          width: 900,
          height: 600,
          opacity: imageProgress,
          transform: `translateY(${(1 - imageProgress) * 54}px) scale(${0.95 + imageProgress * 0.05})`,
        }}
        imageFit="cover"
        padding={0}
      />

      <Tag
        label="1枚目をベースに"
        accent={palette.cyan}
        style={{
          left: 96,
          bottom: 120 + float(frame, 18, 6, 0),
        }}
      />
      <Tag
        label="2枚目のキャラへ差し替え"
        accent={palette.gold}
        style={{
          left: 296,
          bottom: 120 + float(frame, 18, 6, 14),
        }}
      />
    </SceneBackground>
  );
};
