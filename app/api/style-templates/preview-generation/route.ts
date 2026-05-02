import { handlePreviewGeneration } from "./handler";

// Vercel Fluid Compute でも明示しないと環境差で打ち切られる（既存の bonus/grant-batch を踏襲）
export const maxDuration = 120;

export const POST = handlePreviewGeneration;
