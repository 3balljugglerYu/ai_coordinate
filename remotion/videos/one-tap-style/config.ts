export const ONE_TAP_STYLE_PROMO_FPS = 30;
export const ONE_TAP_STYLE_PROMO_WIDTH = 1920;
export const ONE_TAP_STYLE_PROMO_HEIGHT = 1080;

export const TRANSITION_DURATION_IN_FRAMES = 10;

export const sceneDurationsInFrames = {
  cinematicTitle1: 90,
  cinematicTitle2: 90,
  intro: 90,
  stylePick: 100,
  characterPick: 85,
  generate: 105,
  reveal: 150,
} as const;

export const ONE_TAP_STYLE_PROMO_DURATION_IN_FRAMES =
  sceneDurationsInFrames.cinematicTitle1 +
  sceneDurationsInFrames.cinematicTitle2 +
  sceneDurationsInFrames.intro +
  sceneDurationsInFrames.stylePick +
  sceneDurationsInFrames.characterPick +
  sceneDurationsInFrames.generate +
  sceneDurationsInFrames.reveal -
  TRANSITION_DURATION_IN_FRAMES * 6;

export const phoneFrame = {
  width: 560,
  height: 940,
  radius: 42,
} as const;

export const palette = {
  canvas: "#fff8f1",
  canvasWarm: "#ffeede",
  paper: "#fffefb",
  paperSoft: "rgba(255,255,255,0.86)",
  ink: "#20304d",
  muted: "#66738f",
  line: "rgba(32,48,77,0.1)",
  shadow: "rgba(255,129,116,0.18)",
  coral: "#ff7f73",
  peach: "#ffb45c",
  butter: "#ffe07d",
  mint: "#72d5bb",
  sky: "#6eb2ff",
  violet: "#a48cff",
  rose: "#ff90c2",
  success: "#39c985",
  overlay: "rgba(255,255,255,0.72)",
};

export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

export const fontFamily =
  '"Avenir Next", "Futura", "Hiragino Sans", "Yu Gothic", sans-serif';
