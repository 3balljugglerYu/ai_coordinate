import {interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";
import {clamp, palette} from "../config";
import {fadeIn, riseIn, scaleIn} from "../helpers";
import {
  AppHeader,
  PhoneShell,
  PrimaryButton,
  ProgressCard,
  ReferenceCard,
  SceneBackground,
  SceneTextBlock,
  ValueBadge,
} from "../shared";
import type {
  OneTapStylePromoCopy,
  OneTapStylePromoResolvedStyleOption,
} from "../types";

export const GenerateScene = ({
  copy,
  selectedStyle,
  characterImageUrl,
}: {
  copy: OneTapStylePromoCopy;
  selectedStyle: OneTapStylePromoResolvedStyleOption;
  characterImageUrl: string;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const phoneProgress = spring({frame, fps, config: {damping: 180}});
  const buttonPress = spring({
    frame: frame - 14,
    fps,
    config: {damping: 210},
  });
  const progressProgress = fadeIn(frame, 24, 18);
  const progressValue = interpolate(frame, [24, 90], [14, 100], clamp);
  const messageIndex = Math.min(
    copy.progressMessages.length - 1,
    Math.floor(interpolate(frame, [24, 86], [0, copy.progressMessages.length], clamp)),
  );

  return (
    <SceneBackground>
      <ValueBadge
        label={copy.valueBadge}
        accent={palette.sky}
        style={{
          position: "absolute",
          top: 62,
          right: 72,
          opacity: fadeIn(frame, 4, 14),
          transform: `translateY(${riseIn(frame, 4, 18)}px) scale(${scaleIn(frame, 4, 0.96)})`,
        }}
      />

      <PhoneShell
        style={{
          left: 82,
          top: 74,
          opacity: phoneProgress,
          transform: `translateY(${(1 - phoneProgress) * 32}px) scale(${0.97 + phoneProgress * 0.03})`,
        }}
      >
        <AppHeader title={copy.pageTitle} description={copy.pageDescription} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
            minHeight: 228,
          }}
        >
          <ReferenceCard label={copy.sourceLabel} imageUrl={characterImageUrl} />
          <ReferenceCard label={copy.styleLabel} imageUrl={selectedStyle.imageUrl} />
        </div>

        <div
          style={{
            marginTop: 6,
            position: "relative",
            transform: `scale(${1 - buttonPress * 0.04})`,
          }}
        >
          <PrimaryButton label={copy.actionLabel} />
        </div>

        <div
          style={{
            fontSize: 17,
            lineHeight: 1.45,
            color: palette.muted,
            textAlign: "center",
          }}
        >
          {copy.generateHint}
        </div>

        <ProgressCard
          title={copy.progressTitle}
          message={copy.progressMessages[messageIndex]}
          hint={copy.progressHint}
          progress={progressValue}
          style={{
            opacity: progressProgress,
            transform: `translateY(${(1 - progressProgress) * 24}px) scale(${0.97 + progressProgress * 0.03})`,
          }}
        />
      </PhoneShell>

      <SceneTextBlock
        title={copy.stepGenerate}
        body={copy.stepGenerateBody}
        style={{
          left: 960,
          right: 0,
          top: 306,
          opacity: fadeIn(frame, 14, 16),
          transform: `translateY(${riseIn(frame, 14, 26)}px)`,
        }}
      />
    </SceneBackground>
  );
};
