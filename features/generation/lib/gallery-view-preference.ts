/**
 * コーディネート画面の「生成結果一覧」表示モード（grid / list）を localStorage に
 * 永続化するためのヘルパー。
 *
 * SSR セーフ: `typeof window === "undefined"` で server 側を弾き、
 * localStorage アクセスは try/catch する。
 */

export const COORDINATE_GALLERY_VIEW_STORAGE_KEY =
  "persta-ai:coordinate-gallery-view";

export type CoordinateGalleryView = "grid" | "list";

const VIEWS: ReadonlyArray<CoordinateGalleryView> = ["grid", "list"];
const DEFAULT_VIEW: CoordinateGalleryView = "grid";

function isCoordinateGalleryView(
  value: unknown,
): value is CoordinateGalleryView {
  return (
    typeof value === "string" &&
    (VIEWS as ReadonlyArray<string>).includes(value)
  );
}

export function readPreferredGalleryView(): CoordinateGalleryView {
  if (typeof window === "undefined") return DEFAULT_VIEW;
  try {
    const raw = window.localStorage.getItem(
      COORDINATE_GALLERY_VIEW_STORAGE_KEY,
    );
    return isCoordinateGalleryView(raw) ? raw : DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
}

export function writePreferredGalleryView(view: CoordinateGalleryView): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COORDINATE_GALLERY_VIEW_STORAGE_KEY, view);
  } catch {
    // localStorage 不可のブラウザ・private mode では無視
  }
}
