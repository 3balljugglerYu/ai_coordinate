import { LayoutGrid, Sparkles } from "lucide-react";
import {
  CATALOG_ENTRY_PATH,
  GENERATION_ENTRY_PATH,
  getGenerationEntryItem,
  isNavItemActive,
  resolveCatalogEntryPath,
  resolveGenerationEntryPath,
  resolveNavEntryDestination,
} from "@/lib/nav-entries";
import {
  LAST_GENERATION_MODE_STORAGE_KEY,
  setLastGenerationModePath,
} from "@/features/generation/lib/generation-mode-preference";
import { TUTORIAL_STORAGE_KEYS } from "@/features/tutorial/types";

/**
 * ボトムナビとサイドバーで共通の「生成の入口」「カタログ」の扱い。
 *
 * 生成の入口(コーディネート)は刷新前(一般の利用者)のナビにだけある。
 * カタログは刷新後(公開前は運営だけ)のナビにだけあり、生成の画面も含めて受け持つ
 * (docs/planning/catalog-three-tabs-implementation-plan.md ADR-004)。
 * どちらの項目がナビに出るかは NavigationBar / AppSidebar が決めるので、
 * ここの判定は刷新の状態を見ない。
 */
describe("nav-entries", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  describe("resolveGenerationEntryPath(コーディネートを押したときの行き先)", () => {
    test("前回使った生成モードへ戻る", () => {
      setLastGenerationModePath("/free");
      expect(resolveGenerationEntryPath()).toBe("/free");

      setLastGenerationModePath("/style");
      expect(resolveGenerationEntryPath()).toBe("/style");
    });

    test("前回が廃止した Coordinate なら Free Style", () => {
      // 廃止前にタブが保存した値。/coordinate は Free Style へ転送されるので、
      // 転送を待たずに行き先を Free Style にする
      window.localStorage.setItem(LAST_GENERATION_MODE_STORAGE_KEY, "/coordinate");
      expect(resolveGenerationEntryPath()).toBe("/free");
    });

    test("前回のモードが無ければ One-Tap Style", () => {
      expect(resolveGenerationEntryPath()).toBe("/style");
    });

    test("チュートリアルツアー中は One-Tap Style に固定する", () => {
      setLastGenerationModePath("/free");
      window.sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS, "true");
      expect(resolveGenerationEntryPath()).toBe("/style");
    });
  });

  describe("resolveCatalogEntryPath(カタログを押したときの行き先)", () => {
    test("ふだんはPerstaのカタログ(/styles)を開く", () => {
      expect(resolveCatalogEntryPath()).toBe("/styles");
    });

    /*
      ⭐ 刷新後はナビに生成の入口が無く、ツアーの最初の一歩は「カタログ」を指す。
      ツアーの続き(スタイル選び → キャラ → 生成)は /style にあるので、
      ツアー中に押したら /style を開く。そうしないとツアーが止まる。
    */
    test("チュートリアルツアー中は One-Tap Style(/style)を開く", () => {
      window.sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS, "true");

      expect(resolveCatalogEntryPath()).toBe("/style");
    });
  });

  /*
    ⭐ ボトムナビとサイドバーは、押した項目の行き先をこの1つの関数で決める。
    片方だけ直す事故を防ぐため、判定をここに集めている。
  */
  describe("resolveNavEntryDestination(押したときの行き先)", () => {
    test("コーディネートは、前回使った生成モードへ", () => {
      setLastGenerationModePath("/free");

      expect(resolveNavEntryDestination(GENERATION_ENTRY_PATH)).toBe("/free");
    });

    test("カタログは、Perstaのカタログ(/styles)へ", () => {
      expect(resolveNavEntryDestination(CATALOG_ENTRY_PATH)).toBe("/styles");
    });

    test.each([GENERATION_ENTRY_PATH, CATALOG_ENTRY_PATH])(
      "チュートリアルツアー中は、%s も One-Tap Style(/style)へ",
      (itemPath) => {
        setLastGenerationModePath("/free");
        window.sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS, "true");

        expect(resolveNavEntryDestination(itemPath)).toBe("/style");
      }
    );

    test.each(["/", "/challenge", "/notifications", "/my-page", "/free", "/style"])(
      "%s は行き先を決め直さない(null。項目のパスへそのまま進む)",
      (itemPath) => {
        window.sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS, "true");

        expect(resolveNavEntryDestination(itemPath)).toBeNull();
      }
    );
  });

  describe("getGenerationEntryItem(ナビの生成の入口の項目)", () => {
    test("刷新前は「コーディネート」", () => {
      expect(getGenerationEntryItem(false)).toEqual({
        path: GENERATION_ENTRY_PATH,
        labelKey: "coordinate",
        icon: Sparkles,
      });
    });

    test("刷新後は「カタログ」(/styles)", () => {
      expect(getGenerationEntryItem(true)).toEqual({
        path: CATALOG_ENTRY_PATH,
        labelKey: "catalog",
        icon: LayoutGrid,
      });
    });
  });

  describe("isNavItemActive(選択中の表示)", () => {
    test("同じパスにいれば選択中", () => {
      expect(isNavItemActive("/challenge", "/challenge")).toBe(true);
      expect(isNavItemActive("/challenge", "/notifications")).toBe(false);
    });

    test("コーディネートは /style で選択中(/free はこれまでどおり対象外)", () => {
      expect(isNavItemActive(GENERATION_ENTRY_PATH, "/style")).toBe(true);
      expect(isNavItemActive(GENERATION_ENTRY_PATH, "/free")).toBe(false);
    });

    test("コーディネートはカタログの画面では選択中にしない", () => {
      expect(isNavItemActive(GENERATION_ENTRY_PATH, "/styles")).toBe(false);
      expect(isNavItemActive(GENERATION_ENTRY_PATH, "/user-styles")).toBe(false);
    });

    /*
      ⭐ カタログは生成の画面もカタログの中として扱う。/free(カタログをつくる)と
      /style(One-Tap の画面)でも選択中にする。
    */
    test.each(["/styles", "/user-styles", "/styles/paris-code", "/free", "/style"])(
      "カタログは %s で選択中",
      (pathname) => {
        expect(isNavItemActive(CATALOG_ENTRY_PATH, pathname)).toBe(true);
      }
    );

    test.each(["/", "/challenge", "/my-page", "/stylesheet"])(
      "カタログは %s では選択中にしない",
      (pathname) => {
        expect(isNavItemActive(CATALOG_ENTRY_PATH, pathname)).toBe(false);
      }
    );
  });
});
