import {spring, useCurrentFrame, useVideoConfig} from "remotion";
import {palette} from "../config";
import {fadeIn, riseIn, scaleIn} from "../helpers";
import {
  BrandLockup,
  FloatingResultCard,
  ReferenceCard,
  SceneBackground,
  SceneTextBlock,
  ValueBadge,
} from "../shared";
import type {
  OneTapStylePromoCopy,
  OneTapStylePromoResolvedStyleOption,
} from "../types";

export const RevealScene = ({
  copy,
  appIconUrl,
  characterImageUrl,
  resultImageUrl,
  selectedStyle,
  mainImageUrl,
}: {
  copy: OneTapStylePromoCopy;
  appIconUrl: string;
  characterImageUrl: string;
  resultImageUrl: string;
  selectedStyle: OneTapStylePromoResolvedStyleOption;
  mainImageUrl: string;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cardProgress = spring({frame, fps, config: {damping: 180}});
  const copyProgress = spring({
    frame: frame - 14,
    fps,
    config: {damping: 170},
  });

  return (
    <SceneBackground imageUrl={mainImageUrl} imageOpacity={0.2}>
      <ValueBadge
        label={copy.revealLabel}
        accent={palette.success}
        style={{
          position: "absolute",
          top: 62,
          left: 72,
          opacity: fadeIn(frame, 4, 14),
          transform: `translateY(${riseIn(frame, 4, 18)}px) scale(${scaleIn(frame, 4, 0.96)})`,
        }}
      />

      <ValueBadge
        label={copy.valueBadge}
        accent={palette.sky}
        style={{
          position: "absolute",
          top: 62,
          right: 72,
          opacity: fadeIn(frame, 8, 14),
          transform: `translateY(${riseIn(frame, 8, 18)}px) scale(${scaleIn(frame, 8, 0.96)})`,
        }}
      />

      <SceneTextBlock
        title={copy.endingHeadline}
        body={copy.endingBody}
        style={{
          left: 78,
          top: 184,
          opacity: copyProgress,
          transform: `translateY(${(1 - copyProgress) * 24}px)`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 82,
          top: 516,
          display: "flex",
          gap: 18,
          opacity: fadeIn(frame, 18, 16),
          transform: `translateY(${riseIn(frame, 18, 24)}px)`,
        }}
      >
        <ReferenceCard
          label={copy.beforeLabel}
          imageUrl={characterImageUrl}
          style={{width: 214, height: 292}}
        />
        <ReferenceCard
          label={copy.styleLabel}
          imageUrl={selectedStyle.imageUrl}
          style={{width: 214, height: 292}}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 78,
          bottom: 72,
          opacity: fadeIn(frame, 28, 16),
          transform: `translateY(${riseIn(frame, 28, 20)}px)`,
        }}
      >
        <BrandLockup iconUrl={appIconUrl} caption={copy.brandCaption} />
      </div>

      <FloatingResultCard
        imageUrl={resultImageUrl}
        label={copy.resultCardLabel}
        style={{
          position: "absolute",
          right: 72,
          top: 150,
          width: 948,
          height: 782,
          opacity: cardProgress,
          transform: `translateY(${(1 - cardProgress) * 34}px) scale(${0.95 + cardProgress * 0.05}) rotate(-1.5deg)`,
        }}
      />
    </SceneBackground>
  );
};
