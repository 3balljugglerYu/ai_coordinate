export const PERSTA_INTRO_VIDEO_FPS = 30;
export const PERSTA_INTRO_VIDEO_WIDTH = 1920;
export const PERSTA_INTRO_VIDEO_HEIGHT = 1080;
export const PERSTA_INTRO_VIDEO_DURATION_IN_FRAMES = 16 * PERSTA_INTRO_VIDEO_FPS;

export const TRANSITION_DURATION_IN_FRAMES = 12;
export const INTRO_DURATION_IN_FRAMES =
  4 * PERSTA_INTRO_VIDEO_FPS + TRANSITION_DURATION_IN_FRAMES;
export const BASE_DURATION_IN_FRAMES =
  3 * PERSTA_INTRO_VIDEO_FPS + TRANSITION_DURATION_IN_FRAMES;
export const SWAP_DURATION_IN_FRAMES =
  3 * PERSTA_INTRO_VIDEO_FPS + TRANSITION_DURATION_IN_FRAMES;
export const RESULT_DURATION_IN_FRAMES =
  3 * PERSTA_INTRO_VIDEO_FPS + TRANSITION_DURATION_IN_FRAMES;
export const CTA_DURATION_IN_FRAMES = 3 * PERSTA_INTRO_VIDEO_FPS;

export const palette = {
  ink: "#050816",
  midnight: "#0b1020",
  panel: "rgba(8, 14, 28, 0.7)",
  blue: "#2e62ff",
  cyan: "#8cf0ff",
  mint: "#8ef0cf",
  rose: "#ff9eb2",
  gold: "#ffd97b",
  text: "#f9fbff",
  muted: "#a7b6d4",
};

export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

export const fontFamily =
  '"Avenir Next", "Futura", "Hiragino Sans", "Yu Gothic", sans-serif';
