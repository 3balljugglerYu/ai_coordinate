import { statSync } from "fs";
import path from "path";

export type StylePresetId =
  | "paris_code"
  | "fluffy_pajamas_code"
  | "gothic_witch"
  | "kimono"
  | "spring_smart_casual";

export interface StylePreset {
  id: StylePresetId;
  name: string;
  imagePublicPath: string;
  imageMimeType: string;
  imageWidth: number;
  imageHeight: number;
  imageFilePath: string;
  promptFilePath: string;
}

export interface StylePresetSummary {
  id: StylePresetId;
  name: string;
  imagePublicPath: string;
  imageWidth: number;
  imageHeight: number;
  imageVersion: string;
}

const publicRoot = path.join(process.cwd(), "public");

export const STYLE_PRESETS: readonly StylePreset[] = [
  {
    id: "fluffy_pajamas_code",
    name: "FLUFFY PAJAMAS CODE",
    imagePublicPath: "/style/fluffy_pajamas_code/fluffy_pajamas_code.webp",
    imageMimeType: "image/webp",
    imageWidth: 912,
    imageHeight: 1173,
    imageFilePath: path.join(
      publicRoot,
      "style/fluffy_pajamas_code/fluffy_pajamas_code.webp"
    ),
    promptFilePath: path.join(
      publicRoot,
      "style/fluffy_pajamas_code/fluffy_pajamas_code.txt"
    ),
  },
  {
    id: "gothic_witch",
    name: "GOTHIC WITCH",
    imagePublicPath: "/style/gothic_witch/gothic_witch.webp",
    imageMimeType: "image/webp",
    imageWidth: 1344,
    imageHeight: 1792,
    imageFilePath: path.join(
      publicRoot,
      "style/gothic_witch/gothic_witch.webp"
    ),
    promptFilePath: path.join(
      publicRoot,
      "style/gothic_witch/gothic_witch.txt"
    ),
  },
  {
    id: "kimono",
    name: "KIMONO",
    imagePublicPath: "/style/kimono/kimono.webp",
    imageMimeType: "image/webp",
    imageWidth: 864,
    imageHeight: 1184,
    imageFilePath: path.join(publicRoot, "style/kimono/kimono.webp"),
    promptFilePath: path.join(publicRoot, "style/kimono/kimono.txt"),
  },
  {
    id: "paris_code",
    name: "PARIS CODE",
    imagePublicPath: "/style/paris_code/paris_code.webp",
    imageMimeType: "image/webp",
    imageWidth: 912,
    imageHeight: 1173,
    imageFilePath: path.join(publicRoot, "style/paris_code/paris_code.webp"),
    promptFilePath: path.join(publicRoot, "style/paris_code/paris_code.txt"),
  },
  {
    id: "spring_smart_casual",
    name: "SPRING SMART CASUAL",
    imagePublicPath:
      "/style/spring_smart_casual/spring_smart_casual.webp",
    imageMimeType: "image/webp",
    imageWidth: 576,
    imageHeight: 768,
    imageFilePath: path.join(
      publicRoot,
      "style/spring_smart_casual/spring_smart_casual.webp"
    ),
    promptFilePath: path.join(
      publicRoot,
      "style/spring_smart_casual/spring_smart_casual.txt"
    ),
  },
] as const;

export function getStylePresetById(id: string): StylePreset | null {
  return STYLE_PRESETS.find((preset) => preset.id === id) ?? null;
}

function getImageVersion(imageFilePath: string): string {
  return String(Math.trunc(statSync(imageFilePath).mtimeMs));
}

export function getStylePresetSummaries(): readonly StylePresetSummary[] {
  return STYLE_PRESETS.map(
    ({ id, name, imagePublicPath, imageWidth, imageHeight, imageFilePath }) => ({
      id,
      name,
      imagePublicPath,
      imageWidth,
      imageHeight,
      imageVersion: getImageVersion(imageFilePath),
    })
  );
}
