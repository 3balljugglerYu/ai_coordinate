import {
  CATALOG_ENTRY_PATH,
  GENERATION_ENTRY_PATH,
  isNavItemActive,
  resolveGenerationEntryPath,
} from "@/lib/nav-entries";
import { setLastGenerationModePath } from "@/features/generation/lib/generation-mode-preference";
import { TUTORIAL_STORAGE_KEYS } from "@/features/tutorial/types";

/**
 * ボトムナビとサイドバーで共通の「生成の入口」「カタログ」の扱い。
 * カタログ刷新(段階公開中は運営のみ)の前後で、行き先と選択中の表示が変わる。
 */
describe("nav-entries", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  describe("resolveGenerationEntryPath(生成の入口を押したときの行き先)", () => {
    test("刷新前(コーディネート): 前回使った生成モードへ戻る", () => {
      setLastGenerationModePath("/free");
      expect(resolveGenerationEntryPath(false)).toBe("/free");

      setLastGenerationModePath("/coordinate");
      expect(resolveGenerationEntryPath(false)).toBe("/coordinate");
    });

    test("刷新前: 前回のモードが無ければ One-Tap Style", () => {
      expect(resolveGenerationEntryPath(false)).toBe("/style");
    });

    test.each(["/style", "/coordinate", "/free"] as const)(
      "刷新後(つくる): 前回のモードが %s でも毎回 Free Style",
      (lastMode) => {
        setLastGenerationModePath(lastMode);
        expect(resolveGenerationEntryPath(true)).toBe("/free");
      }
    );

    test.each([false, true])(
      "チュートリアルツアー中は刷新の前後を問わず One-Tap Style に固定する(刷新後=%s)",
      (isCatalogRevamp) => {
        setLastGenerationModePath("/free");
        window.sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS, "true");
        expect(resolveGenerationEntryPath(isCatalogRevamp)).toBe("/style");
      }
    );
  });

  describe("isNavItemActive(選択中の表示)", () => {
    test("同じパスにいれば選択中", () => {
      expect(isNavItemActive("/challenge", "/challenge", false)).toBe(true);
      expect(isNavItemActive("/challenge", "/notifications", true)).toBe(false);
    });

    test("刷新前: 生成の入口は /coordinate と /style で選択中(/free はこれまでどおり対象外)", () => {
      expect(isNavItemActive(GENERATION_ENTRY_PATH, "/coordinate", false)).toBe(true);
      expect(isNavItemActive(GENERATION_ENTRY_PATH, "/style", false)).toBe(true);
      expect(isNavItemActive(GENERATION_ENTRY_PATH, "/free", false)).toBe(false);
    });

    test.each(["/coordinate", "/style", "/free"])(
      "刷新後: 生成の入口(つくる)は %s で選択中",
      (pathname) => {
        expect(isNavItemActive(GENERATION_ENTRY_PATH, pathname, true)).toBe(true);
      }
    );

    test.each(["/styles", "/user-styles", "/styles/paris-code"])(
      "カタログは %s で選択中",
      (pathname) => {
        expect(isNavItemActive(CATALOG_ENTRY_PATH, pathname, true)).toBe(true);
      }
    );

    test("One-Tap Style(/style)はカタログではなく、つくるの側", () => {
      expect(isNavItemActive(CATALOG_ENTRY_PATH, "/style", true)).toBe(false);
      expect(isNavItemActive(GENERATION_ENTRY_PATH, "/styles", true)).toBe(false);
      expect(isNavItemActive(GENERATION_ENTRY_PATH, "/user-styles", true)).toBe(false);
    });
  });
});
