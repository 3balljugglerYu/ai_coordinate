"use client";

import { GenerationStatusCard } from "@/features/generation/components/GenerationStatusCard";

interface StyleGenerationStatusCardProps {
  title: string;
  message: string;
  liveMessage: string;
  hint: string;
  slowHint: string;
  progress: number;
  isLongWait: boolean;
  isComplete: boolean;
  prefersReducedMotion: boolean;
}

export function StyleGenerationStatusCard({
  title,
  message,
  liveMessage,
  hint,
  slowHint,
  progress,
  isLongWait,
  isComplete,
  prefersReducedMotion,
}: StyleGenerationStatusCardProps) {
  const footerText = isComplete ? hint : isLongWait ? slowHint : hint;

  return (
    <GenerationStatusCard
      title={title}
      message={message}
      liveMessage={liveMessage}
      footerText={footerText}
      progress={progress}
      isComplete={isComplete}
      prefersReducedMotion={prefersReducedMotion}
    />
  );
}
