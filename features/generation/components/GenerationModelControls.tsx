"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { GeminiBananaSizeSelector } from "./GeminiBananaSizeSelector";
import { GptImage2QualitySelector } from "./GptImage2QualitySelector";
import { GptImage2SizeSelector } from "./GptImage2SizeSelector";
import {
  LockableModelSelect,
  type ModelSelectAuthState,
} from "./LockableModelSelect";
import type { GeminiModel } from "@/features/generation/types";

interface GenerationModelControlsProps {
  value: GeminiModel;
  onChange: (next: GeminiModel) => void;
  onLockedClick: () => void;
  authState: ModelSelectAuthState;
  modelLabel: ReactNode;
  disabled?: boolean;
  isModelSelectable?: (model: GeminiModel) => boolean;
}

export function GenerationModelControls({
  value,
  onChange,
  onLockedClick,
  authState,
  modelLabel,
  disabled,
  isModelSelectable,
}: GenerationModelControlsProps) {
  return (
    <>
      <div data-tour="tour-model-select">
        <Label className="text-base font-medium mb-3 block">
          {modelLabel}
        </Label>
        <LockableModelSelect
          value={value}
          onChange={onChange}
          onLockedClick={onLockedClick}
          authState={authState}
          disabled={disabled}
          isModelSelectable={isModelSelectable}
        />
      </div>

      <GptImage2QualitySelector
        value={value}
        onChange={onChange}
        onLockedClick={onLockedClick}
        authState={authState}
        disabled={disabled}
        isModelSelectable={isModelSelectable}
      />

      <GptImage2SizeSelector
        value={value}
        onChange={onChange}
        onLockedClick={onLockedClick}
        authState={authState}
        disabled={disabled}
        isModelSelectable={isModelSelectable}
      />

      <GeminiBananaSizeSelector
        value={value}
        onChange={onChange}
        onLockedClick={onLockedClick}
        authState={authState}
        disabled={disabled}
        isModelSelectable={isModelSelectable}
      />
    </>
  );
}
