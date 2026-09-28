/** @jest-environment node */

jest.mock("@/features/style-presets/lib/style-preset-repository");
jest.mock("@/features/style-presets/lib/style-preset-storage");
jest.mock("@/features/style-presets/lib/preset-category-repository");
// 接続先の表示は、createAdminClient が実際に使う値(lib/env の env)から取る
jest.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co" },
}));

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  createStylePreset,
  getStylePresetForAdminById,
  listStylePresetsForAdmin,
} from "@/features/style-presets/lib/style-preset-repository";
import {
  deleteStylePresetImage,
  uploadStylePresetImage,
} from "@/features/style-presets/lib/style-preset-storage";
import {
  getPresetCategoryByKey,
  type PresetCategoryAdmin,
} from "@/features/style-presets/lib/preset-category-repository";
import {
  normalizeStylePresetOptionalPrompt,
  normalizeStylePresetPrompt,
  normalizeStylePresetTitle,
  STYLE_PRESET_MAX_FILE_SIZE,
  type StylePresetAdmin,
  type StylePresetInsert,
} from "@/features/style-presets/lib/schema";
import {
  detectImageMimeType,
  runRegisterStylePresets,
} from "@/scripts/style-presets/register-style-presets";

const mockCreateStylePreset = createStylePreset as jest.MockedFunction<
  typeof createStylePreset
>;
const mockGetStylePresetForAdminById =
  getStylePresetForAdminById as jest.MockedFunction<
    typeof getStylePresetForAdminById
  >;
const mockListStylePresetsForAdmin =
  listStylePresetsForAdmin as jest.MockedFunction<
    typeof listStylePresetsForAdmin
  >;
const mockUploadStylePresetImage =
  uploadStylePresetImage as jest.MockedFunction<typeof uploadStylePresetImage>;
const mockDeleteStylePresetImage =
  deleteStylePresetImage as jest.MockedFunction<typeof deleteStylePresetImage>;
const mockGetPresetCategoryByKey =
  getPresetCategoryByKey as jest.MockedFunction<typeof getPresetCategoryByKey>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** sharp で作った本物の小さな画像。 */
async function realImage(
  format: "png" | "jpeg" | "webp" | "gif"
): Promise<Buffer> {
  return sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: { r: 200, g: 60, b: 60 },
    },
  })
    .toFormat(format)
    .toBuffer();
}

let realPng: Buffer;
let realGif: Buffer;

beforeAll(async () => {
  realPng = await realImage("png");
  realGif = await realImage("gif");
});

/**
 * 本物の PNG の後ろを 0 で埋めて、ちょうど size バイトにする。
 * 画像の読み取り(ヘッダーの解析)は IEND の後ろを見ない。
 */
function pngOfSize(size: number): Buffer {
  return Buffer.concat([realPng, Buffer.alloc(size - realPng.length)]);
}

function buildCategory(
  overrides: Partial<PresetCategoryAdmin> = {}
): PresetCategoryAdmin {
  return {
    id: "8cc6ca76-223c-434c-93a9-9a27603ff757",
    key: "admin_preview",
    displayNameJa: "研究中のプロンプト",
    visibility: "admin_only",
    isActive: true,
    defaultImageInputMode: "single",
    ...overrides,
  } as unknown as PresetCategoryAdmin;
}

const ADMIN_PREVIEW = buildCategory();
const COORDINATE_2 = buildCategory({
  id: "4205bf33-4773-4c93-aa55-b7540f02a5cd",
  key: "coordinate_2",
  displayNameJa: "コーディネート2.0",
  visibility: "public",
});

/** テストごとに差し替えるカテゴリ表(キー → カテゴリ)。 */
let categories: Map<string, PresetCategoryAdmin>;

// ⭐ URL・保存場所・接続先はわざと互いに含まれない値にする。どれかを表示した
//    ついでに別の検証が通ってしまわないように。
const UPLOADED = {
  imageUrl: "https://cdn.example.test/public/thumbnail.webp",
  storagePath: "preset-dir/file-id.webp",
  width: 960,
  height: 1280,
};

/** 本番に今あるプリセット(listStylePresetsForAdmin が返すもの)。 */
let existingPresets: StylePresetAdmin[];
/** このテストの中で作ったプリセットの数。 */
let createdCount: number;

function setExistingPresets(presets: StylePresetAdmin[]) {
  existingPresets = presets;
  mockListStylePresetsForAdmin.mockResolvedValue(presets);
}

/** 重複しないタイトルの既存プリセットを n 件作る(件数だけが要るとき用)。 */
function otherPresets(count: number): StylePresetAdmin[] {
  return Array.from(
    { length: count },
    (_, index) =>
      ({
        id: `existing-${index}`,
        slug: `existing-${index}`,
        title: `Existing Look ${index}`,
        category: { id: COORDINATE_2.id, key: COORDINATE_2.key },
      }) as unknown as StylePresetAdmin
  );
}

/**
 * DB に保存されたあとの姿を入力から作る。createStylePreset は保存前に
 * タイトルとプロンプトを正規化し(style-preset-repository.ts の createStylePreset)、
 * 保存した行を読み直して返す。
 *
 * ⭐ 並び順は本物の RPC と同じく「ほかのプリセットの件数」までに丸める
 *    (create_style_preset → place_style_preset_at_order)。丸めを真似ないと、
 *    大きすぎる並び順を渡しても照合が通ってしまう。
 */
function persistedFrom(input: StylePresetInsert): StylePresetAdmin {
  const category = [...categories.values()].find(
    (candidate) => candidate.id === input.categoryId
  );
  const others = existingPresets.length + createdCount;
  createdCount += 1;
  return {
    id: input.id,
    slug: `slug-${input.id}`,
    title: normalizeStylePresetTitle(input.title),
    stylingPrompt: normalizeStylePresetPrompt(input.stylingPrompt),
    backgroundPrompt: normalizeStylePresetOptionalPrompt(input.backgroundPrompt),
    thumbnailImageUrl: input.thumbnailImageUrl,
    thumbnailStoragePath: input.thumbnailStoragePath ?? null,
    thumbnailWidth: input.thumbnailWidth,
    thumbnailHeight: input.thumbnailHeight,
    sortOrder: Math.min(input.sortOrder ?? 0, others),
    status: input.status,
    category: {
      id: input.categoryId,
      key: category?.key,
      displayNameJa: category?.displayNameJa,
    },
    imageInputMode: input.imageInputMode,
    dualReferenceSource: input.dualReferenceSource,
    createdBy: input.createdBy ?? null,
  } as unknown as StylePresetAdmin;
}

// ⭐ CRLF を混ぜておく。保存時は LF に正規化されるので、照合が正規化後の値で
//    比べていないと、正しく保存できていても NG になる。
const STYLING_PROMPT =
  "Outfit Edit - image_0.png\r\nApply: Wine-red ribbed turtleneck sweater.\r\n";
const BACKGROUND_PROMPT =
  "Background Edit - image_0.png\nScene: Autumn lakeside wooden boardwalk.\n";

const ENTRY = {
  title: "Autumn Lakeside Wine Red Knit Look",
  image: "image.png",
  stylingPromptFile: "styling.txt",
  backgroundPromptFile: "background.txt",
};

const SECOND_ENTRY = { ...ENTRY, title: "Second Look" };

function defaultFiles(): Record<string, string | Buffer> {
  return {
    "image.png": realPng,
    "styling.txt": STYLING_PROMPT,
    "background.txt": BACKGROUND_PROMPT,
  };
}

/** 照合 NG の行に出す項目名(管理画面の表記)。 */
const VERIFIED_FIELD_LABELS = [
  "タイトル",
  "Styling Prompt",
  "Background Prompt",
  "公開状態",
  "カテゴリ",
  "並び順",
  "サムネイル",
];

let dir: string;

/** 作業フォルダにファイルとマニフェストを書き、マニフェストのパスを返す。 */
function writeWorkspace(
  entries: unknown,
  files: Record<string, string | Buffer> = defaultFiles()
): string {
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  const manifestPath = path.join(dir, "presets.json");
  fs.writeFileSync(manifestPath, JSON.stringify(entries));
  return manifestPath;
}

function createIo() {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  return {
    io: {
      log: (message: string) => {
        stdoutLines.push(message);
      },
      error: (message: string) => {
        stderrLines.push(message);
      },
    },
    stdout: () => stdoutLines.join("\n"),
    stderr: () => stderrLines.join("\n"),
    output: () => [...stdoutLines, ...stderrLines].join("\n"),
  };
}

function expectNothingWritten() {
  expect(mockUploadStylePresetImage).not.toHaveBeenCalled();
  expect(mockCreateStylePreset).not.toHaveBeenCalled();
  expect(mockDeleteStylePresetImage).not.toHaveBeenCalled();
}

function expectNoBoundaryTouched() {
  expectNothingWritten();
  expect(mockGetPresetCategoryByKey).not.toHaveBeenCalled();
  expect(mockListStylePresetsForAdmin).not.toHaveBeenCalled();
}

/** n 回目の createStylePreset に渡した入力。 */
function createInput(callIndex = 0): StylePresetInsert {
  return mockCreateStylePreset.mock.calls[callIndex][0];
}

describe("runRegisterStylePresets", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "register-style-presets-"));
    categories = new Map([
      [ADMIN_PREVIEW.key, ADMIN_PREVIEW],
      [COORDINATE_2.key, COORDINATE_2],
    ]);
    mockGetPresetCategoryByKey.mockImplementation(
      async (key) => categories.get(key) ?? null
    );
    createdCount = 0;
    setExistingPresets([]);
    mockUploadStylePresetImage.mockResolvedValue(UPLOADED);
    mockCreateStylePreset.mockImplementation(async (input) =>
      persistedFrom(input)
    );
    // 作成に失敗したとき、行が保存されていないこと(= 画像を片付けてよいこと)の確認
    mockGetStylePresetForAdminById.mockResolvedValue(null);
    mockDeleteStylePresetImage.mockResolvedValue(undefined);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe("登録", () => {
    test("1件を管理画面と同じ部品・同じ引数で登録し、保存内容を照合する", async () => {
      const manifestPath = writeWorkspace([ENTRY]);
      const { io, stdout } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(0);
      expect(mockGetPresetCategoryByKey.mock.calls[0][0]).toBe("admin_preview");

      // 管理 API と同じく、プリセット ID とファイル ID は別々の UUID
      expect(mockUploadStylePresetImage).toHaveBeenCalledTimes(1);
      const [file, presetId, fileId] = mockUploadStylePresetImage.mock.calls[0];
      expect(presetId).toMatch(UUID_V4);
      expect(fileId).toMatch(UUID_V4);
      expect(fileId).not.toBe(presetId);
      expect(file.type).toBe("image/png");
      expect(Buffer.from(await file.arrayBuffer()).equals(realPng)).toBe(true);

      // 管理 API(app/api/admin/style-presets/route.ts)と同じく、プロンプトは
      // 生のまま渡し、正規化は createStylePreset に任せる
      expect(mockCreateStylePreset).toHaveBeenCalledTimes(1);
      expect(createInput()).toEqual(
        expect.objectContaining({
          id: presetId,
          title: ENTRY.title,
          stylingPrompt: STYLING_PROMPT,
          backgroundPrompt: BACKGROUND_PROMPT,
          thumbnailImageUrl: UPLOADED.imageUrl,
          thumbnailStoragePath: UPLOADED.storagePath,
          thumbnailWidth: UPLOADED.width,
          thumbnailHeight: UPLOADED.height,
          sortOrder: 0,
          status: "published",
          createdBy: null,
          categoryId: ADMIN_PREVIEW.id,
          imageInputMode: "single",
          dualReferenceSource: "admin",
        })
      );

      expect(mockDeleteStylePresetImage).not.toHaveBeenCalled();
      expect(stdout()).toContain("abcdefgh.supabase.co");
      expect(stdout()).toContain(presetId);
      expect(stdout()).toContain("照合: OK");
    });

    test("指定したカテゴリ・公開状態・並び順を、既定値に戻さずそのまま渡す", async () => {
      setExistingPresets(otherPresets(5));
      const manifestPath = writeWorkspace([
        { ...ENTRY, category: "coordinate_2", status: "draft", sortOrder: 5 },
      ]);
      const { io, stdout } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(0);
      expect(mockGetPresetCategoryByKey.mock.calls[0][0]).toBe("coordinate_2");
      expect(createInput()).toEqual(
        expect.objectContaining({
          categoryId: COORDINATE_2.id,
          status: "draft",
          sortOrder: 5,
        })
      );
      expect(stdout()).toContain("一般公開");
      expect(stdout()).toContain("照合: OK");
    });

    test("前後に空白のあるタイトルは生のまま渡し、保存後の正規化された値と照合して OK にする", async () => {
      const manifestPath = writeWorkspace([
        { ...ENTRY, title: `  ${ENTRY.title}  ` },
      ]);
      const { io, stdout } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(0);
      expect(createInput().title).toBe(`  ${ENTRY.title}  `);
      expect(stdout()).toContain("照合: OK");
    });

    test("背景プロンプトの無い件は backgroundPrompt を null で登録する", async () => {
      const withoutBackground = {
        title: ENTRY.title,
        image: ENTRY.image,
        stylingPromptFile: ENTRY.stylingPromptFile,
      };
      const manifestPath = writeWorkspace([withoutBackground]);
      const { io, stdout } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(0);
      expect(createInput().backgroundPrompt).toBeNull();
      expect(stdout()).toContain("照合: OK");
    });

    test("2件は別々の ID で、マニフェストの順に登録する", async () => {
      const manifestPath = writeWorkspace([ENTRY, SECOND_ENTRY]);
      const { io } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(0);
      expect(mockUploadStylePresetImage).toHaveBeenCalledTimes(2);
      const firstId = mockUploadStylePresetImage.mock.calls[0][1];
      const secondId = mockUploadStylePresetImage.mock.calls[1][1];
      expect(firstId).not.toBe(secondId);
      expect(createInput(0)).toEqual(
        expect.objectContaining({ id: firstId, title: ENTRY.title })
      );
      expect(createInput(1)).toEqual(
        expect.objectContaining({ id: secondId, title: SECOND_ENTRY.title })
      );
    });

    test("同じタイトルでもカテゴリが違えば、同じマニフェストで両方登録する", async () => {
      const manifestPath = writeWorkspace([
        ENTRY,
        { ...ENTRY, category: "coordinate_2", status: "draft" },
      ]);
      const { io } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(0);
      expect(mockCreateStylePreset).toHaveBeenCalledTimes(2);
      expect(createInput(0).categoryId).toBe(ADMIN_PREVIEW.id);
      expect(createInput(1).categoryId).toBe(COORDINATE_2.id);
    });

    test("--dry-run は接続先と公開範囲を示して検証だけ行い、書き込まない", async () => {
      const manifestPath = writeWorkspace([ENTRY]);
      const { io, stdout } = createIo();

      const exitCode = await runRegisterStylePresets(
        [manifestPath, "--dry-run"],
        io
      );

      expect(exitCode).toBe(0);
      expect(mockGetPresetCategoryByKey.mock.calls[0][0]).toBe("admin_preview");
      expect(mockListStylePresetsForAdmin).toHaveBeenCalled();
      expectNothingWritten();
      expect(stdout()).toContain("abcdefgh.supabase.co");
      expect(stdout()).toContain("運営のみ");
      expect(stdout()).not.toContain("一般公開");
      expect(stdout()).toContain("dry-run");
    });

    /*
      ⭐ 途中で失敗したマニフェストを流し直したとき、登録済みの件を二重に
      作らないため。飛ばした件は既存のプリセットを示し、ほかの件は続ける。
    */
    test("同じカテゴリに同じタイトル(前後の空白違いを含む)があれば既存を示して飛ばし、ほかの件は登録する", async () => {
      setExistingPresets([
        {
          id: "existing-id",
          slug: "existing-slug",
          title: ENTRY.title,
          category: { id: ADMIN_PREVIEW.id, key: ADMIN_PREVIEW.key },
        } as unknown as StylePresetAdmin,
      ]);
      const manifestPath = writeWorkspace([
        { ...ENTRY, title: `  ${ENTRY.title}  ` },
        SECOND_ENTRY,
      ]);
      const { io, output } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(0);
      expect(mockUploadStylePresetImage).toHaveBeenCalledTimes(1);
      expect(mockCreateStylePreset).toHaveBeenCalledTimes(1);
      expect(createInput().title).toBe(SECOND_ENTRY.title);
      expect(output()).toContain("スキップ");
      expect(output()).toContain("existing-slug");
    });

    test("別のカテゴリにある同じタイトルは重複とみなさず登録する", async () => {
      setExistingPresets([
        {
          id: "existing-id",
          slug: "existing-slug",
          title: ENTRY.title,
          category: { id: COORDINATE_2.id, key: COORDINATE_2.key },
        } as unknown as StylePresetAdmin,
      ]);
      const manifestPath = writeWorkspace([ENTRY]);
      const { io } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(0);
      expect(mockCreateStylePreset).toHaveBeenCalledTimes(1);
      expect(createInput().categoryId).toBe(ADMIN_PREVIEW.id);
    });
  });

  describe("画像サイズの境界(管理画面と同じ 5MB)", () => {
    test("5MB ちょうどは受け付ける", async () => {
      const manifestPath = writeWorkspace([ENTRY], {
        ...defaultFiles(),
        "image.png": pngOfSize(STYLE_PRESET_MAX_FILE_SIZE),
      });
      const { io } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(0);
      expect(mockUploadStylePresetImage).toHaveBeenCalledTimes(1);
    });

    test("2件目の画像が 5MB を1バイトでも超えたら、正しい1件目も含めて何も書かない", async () => {
      const manifestPath = writeWorkspace(
        [ENTRY, { ...SECOND_ENTRY, image: "large.png" }],
        {
          ...defaultFiles(),
          "large.png": pngOfSize(STYLE_PRESET_MAX_FILE_SIZE + 1),
        }
      );
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("2件目");
      expect(stderr()).toContain("5MB");
    });
  });

  /*
    ⭐ 並び順は全カテゴリ通しの位置。本物の RPC は「ほかのプリセットの件数」を
    超える値を黙って丸める(place_style_preset_at_order)。丸められると照合が NG に
    なって途中で止まるので、書く前に止める。
    上限は「実行前の件数」で見る(同じ実行で先に登録する件は数えない)。安全側に
    倒した決めごとで、先の件を数えるように変えても退行ではない。
  */
  describe("並び順の境界(今あるプリセットの件数まで)", () => {
    test("今ある件数と同じ並び順(いちばん後ろ)は受け付ける", async () => {
      setExistingPresets(otherPresets(2));
      const manifestPath = writeWorkspace([
        { ...ENTRY, status: "published", sortOrder: 2 },
      ]);
      const { io, stdout } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(0);
      expect(createInput().sortOrder).toBe(2);
      expect(stdout()).toContain("照合: OK");
    });

    test("今ある件数より大きい並び順は、正しい件も含めて何も書かずに止める", async () => {
      setExistingPresets(otherPresets(2));
      const manifestPath = writeWorkspace([
        ENTRY,
        { ...SECOND_ENTRY, status: "published", sortOrder: 3 },
      ]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("2件目");
      expect(stderr()).toContain("並び順");
    });
  });

  /*
    ⭐ 不正な件を「2件目」に置く。先に全件を確かめてから書く作りでないと、
    1件目を本番に登録したあとで2件目を弾くことになる。
  */
  describe("事前検証(1件でも不正なら何も書かない)", () => {
    test("2件目の画像が無ければ、正しい1件目も登録せず、エラーは標準エラーに出す", async () => {
      const manifestPath = writeWorkspace([
        ENTRY,
        { ...SECOND_ENTRY, image: "missing.png" },
      ]);
      const { io, stdout, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("2件目");
      expect(stderr()).toContain("missing.png");
      expect(stdout()).not.toContain("missing.png");
    });

    test("2件目の画像が PNG / JPEG / WebP 以外(GIF)なら、正しい1件目も登録しない", async () => {
      const manifestPath = writeWorkspace(
        [ENTRY, { ...SECOND_ENTRY, image: "animation.gif" }],
        { ...defaultFiles(), "animation.gif": realGif }
      );
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("2件目");
      expect(stderr()).toContain("PNG / JPEG / WebP");
    });

    /*
      ⭐ 先頭だけ PNG の署名で、中身が壊れている画像。先頭バイトだけで判定すると
      確認を通り抜け、登録の途中(WebP への変換)で止まる。
    */
    test("2件目が先頭だけ PNG で中身の壊れた画像なら、正しい1件目も登録しない", async () => {
      const manifestPath = writeWorkspace(
        [ENTRY, { ...SECOND_ENTRY, image: "broken.png" }],
        {
          ...defaultFiles(),
          "broken.png": Buffer.concat([PNG_SIGNATURE, Buffer.alloc(64, 7)]),
        }
      );
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("2件目");
      expect(stderr()).toContain("PNG / JPEG / WebP");
    });

    test("2件目のカテゴリが見つからなければ、正しい1件目も登録しない", async () => {
      const manifestPath = writeWorkspace([
        ENTRY,
        { ...SECOND_ENTRY, category: "no_such_category", status: "draft" },
      ]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("2件目");
      expect(stderr()).toContain("カテゴリが見つかりません");
      expect(stderr()).toContain("no_such_category");
    });

    /*
      ⭐ 公開状態を省略できるのは、既定のカテゴリが運営だけに見えるから。
      カテゴリの公開範囲は管理画面で変えられるデータなので、実行時にも確かめる。
    */
    test("2件目が公開状態を省略していて、既定のカテゴリが一般公開になっていたら、何も書かずに止める", async () => {
      categories.set(
        ADMIN_PREVIEW.key,
        buildCategory({ visibility: "public" })
      );
      const manifestPath = writeWorkspace([
        { ...ENTRY, status: "draft" },
        SECOND_ENTRY,
      ]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("2件目");
      expect(stderr()).toContain("status");
    });

    // ⭐ 値ではなく「明示したかどうか」で決める。published を明示して一般公開の
    //    カテゴリへ公開するのは、運営が選べる正規の使い方
    test.each(["draft", "published"] as const)(
      "既定のカテゴリが一般公開でも、公開状態(%s)を明示していれば登録する",
      async (status) => {
        categories.set(
          ADMIN_PREVIEW.key,
          buildCategory({ visibility: "public" })
        );
        const manifestPath = writeWorkspace([{ ...ENTRY, status }]);
        const { io, stdout } = createIo();

        const exitCode = await runRegisterStylePresets([manifestPath], io);

        expect(exitCode).toBe(0);
        expect(createInput().status).toBe(status);
        expect(stdout()).toContain("一般公開");
      }
    );

    test("プロンプトのファイルが無ければ止める", async () => {
      const manifestPath = writeWorkspace([
        { ...ENTRY, stylingPromptFile: "missing-styling.txt" },
      ]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("1件目");
      expect(stderr()).toContain("missing-styling.txt");
    });

    test("背景プロンプトのファイルが無ければ止める(背景を黙って落とさない)", async () => {
      const manifestPath = writeWorkspace([
        { ...ENTRY, backgroundPromptFile: "missing-background.txt" },
      ]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("1件目");
      expect(stderr()).toContain("missing-background.txt");
    });

    test("2件目の背景プロンプトのファイルが空白だけなら、正しい1件目も登録しない(背景を黙って落とさない)", async () => {
      const manifestPath = writeWorkspace(
        [ENTRY, { ...SECOND_ENTRY, backgroundPromptFile: "blank.txt" }],
        { ...defaultFiles(), "blank.txt": " \r\n\n  " }
      );
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("2件目");
      expect(stderr()).toContain("Background Prompt が空です");
    });

    test("空白だけのプロンプトは止める", async () => {
      const manifestPath = writeWorkspace([ENTRY], {
        ...defaultFiles(),
        "styling.txt": "  \r\n\n ",
      });
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("1件目");
      expect(stderr()).toContain("Styling Prompt が空です");
    });

    test("空白だけのタイトルは止める", async () => {
      const manifestPath = writeWorkspace([{ ...ENTRY, title: "   " }]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("1件目");
      expect(stderr()).toContain("タイトルが空です");
    });

    test("無効(inactive)なカテゴリは止める(管理 API と同じ規則)", async () => {
      categories.set(ADMIN_PREVIEW.key, buildCategory({ isActive: false }));
      const manifestPath = writeWorkspace([ENTRY]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("1件目");
      expect(stderr()).toContain("無効なカテゴリ");
    });

    /*
      ⭐ 既定が dual のカテゴリは参考画像(image_1)が要る。スクリプトはサムネイル
      1枚しか受け取らないので、single に落として登録すると別物になる。止めて
      管理画面へ回す。
    */
    test("参考画像が要るカテゴリ(既定が dual)は止めて管理画面へ回す", async () => {
      categories.set(
        "travel_to_italy",
        buildCategory({
          id: "34782494-7fc6-4501-b07d-d8a7e63f9467",
          key: "travel_to_italy",
          defaultImageInputMode: "dual",
        })
      );
      const manifestPath = writeWorkspace([
        { ...ENTRY, category: "travel_to_italy", status: "draft" },
      ]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("1件目");
      expect(stderr()).toContain("管理画面");
    });

    test("同じマニフェストの中で、同じカテゴリに同じタイトル(前後の空白違いを含む)が2回あれば止める", async () => {
      const manifestPath = writeWorkspace([
        { ...ENTRY, title: ` ${ENTRY.title} ` },
        ENTRY,
      ]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("2件目");
      expect(stderr()).toContain("同じマニフェスト");
    });

    test("マニフェストの形式が不正なら、打ち間違えた項目名を示して止める", async () => {
      const manifestPath = writeWorkspace([
        { ...ENTRY, backgroundPromtFile: "background.txt" },
      ]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNoBoundaryTouched();
      expect(stderr()).toContain("backgroundPromtFile");
    });

    test("カテゴリの取得でエラーになったら、落ちずに止める", async () => {
      mockGetPresetCategoryByKey.mockRejectedValue(
        new Error("カテゴリの取得に失敗しました")
      );
      const manifestPath = writeWorkspace([ENTRY]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("カテゴリの取得に失敗しました");
    });

    test("既存プリセットの一覧が取れなければ、重複を確かめられないので書き込まずに止める", async () => {
      mockListStylePresetsForAdmin.mockRejectedValue(
        new Error("スタイル一覧の取得に失敗しました")
      );
      const manifestPath = writeWorkspace([ENTRY]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("スタイル一覧の取得に失敗しました");
    });

    /*
      ⭐ 一覧は件数の上限を付けずに取るので、1000件を超えると PostgREST の上限で
      黙って欠ける。欠けた一覧では重複も並び順の上限も確かめられないので止める。
    */
    test("既存プリセットが999件なら、一覧は欠けていないので登録する", async () => {
      setExistingPresets(otherPresets(999));
      const manifestPath = writeWorkspace([ENTRY]);
      const { io } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(0);
      expect(mockCreateStylePreset).toHaveBeenCalledTimes(1);
    });

    test("既存プリセットが1000件に届いたら、一覧が欠けているおそれがあるので書き込まずに止める", async () => {
      setExistingPresets(otherPresets(1000));
      const manifestPath = writeWorkspace([ENTRY]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expectNothingWritten();
      expect(stderr()).toContain("1000");
    });
  });

  describe("登録中の失敗", () => {
    test("画像のアップロードに失敗したら、作成も削除もせずに止める", async () => {
      mockUploadStylePresetImage.mockRejectedValue(
        new Error("画像のアップロードに失敗しました: quota")
      );
      const manifestPath = writeWorkspace([ENTRY]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expect(mockCreateStylePreset).not.toHaveBeenCalled();
      expect(mockDeleteStylePresetImage).not.toHaveBeenCalled();
      expect(stderr()).toContain("1件目");
      expect(stderr()).toContain("quota");
    });

    test("作成に失敗して行も無ければ、アップロードした画像を消して止め、以降の件には進まない", async () => {
      mockCreateStylePreset.mockRejectedValueOnce(new Error("rpc failed"));
      const manifestPath = writeWorkspace([ENTRY, SECOND_ENTRY]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      const [, presetId] = mockUploadStylePresetImage.mock.calls[0];
      expect(mockGetStylePresetForAdminById.mock.calls[0][0]).toBe(presetId);
      expect(mockUploadStylePresetImage).toHaveBeenCalledTimes(1);
      expect(mockCreateStylePreset).toHaveBeenCalledTimes(1);
      expect(mockDeleteStylePresetImage).toHaveBeenCalledWith(
        UPLOADED.storagePath
      );
      expect(stderr()).toContain("rpc failed");
    });

    /*
      ⭐ create_style_preset が行を保存したあと、読み直しで失敗することがある。
      行があるのに画像を消すと、画像の無いプリセットが公開状態で残り、流し直しても
      重複として飛ばされて直らない。
    */
    test("作成が失敗しても行が保存されていれば、画像を消さずに ID を示して止め、以降の件には進まない", async () => {
      mockCreateStylePreset.mockRejectedValue(
        new Error("スタイルの取得に失敗しました")
      );
      mockGetStylePresetForAdminById.mockImplementation(
        async (id) =>
          ({
            id,
            slug: "saved-slug",
            title: ENTRY.title,
            category: { id: ADMIN_PREVIEW.id, key: ADMIN_PREVIEW.key },
          }) as unknown as StylePresetAdmin
      );
      const manifestPath = writeWorkspace([ENTRY, SECOND_ENTRY]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      const [, presetId] = mockUploadStylePresetImage.mock.calls[0];
      expect(mockGetStylePresetForAdminById.mock.calls[0][0]).toBe(presetId);
      expect(mockUploadStylePresetImage).toHaveBeenCalledTimes(1);
      expect(mockCreateStylePreset).toHaveBeenCalledTimes(1);
      expect(mockDeleteStylePresetImage).not.toHaveBeenCalled();
      expect(stderr()).toContain(presetId);
    });

    test("作成に失敗し、行が保存されたかも確かめられなければ、画像を消さずに ID を示して止め、以降の件には進まない", async () => {
      mockCreateStylePreset.mockRejectedValue(new Error("rpc timeout"));
      mockGetStylePresetForAdminById.mockRejectedValue(
        new Error("スタイルの取得に失敗しました")
      );
      const manifestPath = writeWorkspace([ENTRY, SECOND_ENTRY]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      const [, presetId] = mockUploadStylePresetImage.mock.calls[0];
      expect(mockUploadStylePresetImage).toHaveBeenCalledTimes(1);
      expect(mockCreateStylePreset).toHaveBeenCalledTimes(1);
      expect(mockDeleteStylePresetImage).not.toHaveBeenCalled();
      expect(stderr()).toContain(presetId);
    });

    test("作成失敗のあと画像の削除にも失敗したら、残った画像の場所を標準エラーに示す", async () => {
      mockCreateStylePreset.mockRejectedValue(new Error("rpc failed"));
      mockDeleteStylePresetImage.mockRejectedValue(new Error("delete failed"));
      const manifestPath = writeWorkspace([ENTRY]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets([manifestPath], io);

      expect(exitCode).toBe(1);
      expect(mockDeleteStylePresetImage).toHaveBeenCalledWith(
        UPLOADED.storagePath
      );
      expect(stderr()).toContain("rpc failed");
      expect(stderr()).toContain("delete failed");
      expect(stderr()).toContain(UPLOADED.storagePath);
    });

    /*
      ⭐ 照合で食い違っても消さない。行はもう DB にあり、消すのは取り返しが
      つかない操作なので、人が確かめられるよう ID と食い違った項目だけを出して止める。
    */
    test.each<[string, (preset: StylePresetAdmin) => StylePresetAdmin]>([
      ["タイトル", (preset) => ({ ...preset, title: "Other Title" })],
      [
        "Styling Prompt",
        (preset) => ({ ...preset, stylingPrompt: "truncated" }),
      ],
      [
        "Background Prompt",
        (preset) => ({ ...preset, backgroundPrompt: null }),
      ],
      ["公開状態", (preset) => ({ ...preset, status: "draft" })],
      [
        "カテゴリ",
        (preset) => ({
          ...preset,
          category: { ...preset.category, id: "another-category-id" },
        }),
      ],
      ["並び順", (preset) => ({ ...preset, sortOrder: 99 })],
      [
        "サムネイル",
        (preset) => ({
          ...preset,
          thumbnailImageUrl: "https://cdn.example.test/public/other.webp",
        }),
      ],
    ])(
      "保存された%sが入力と違えば、消さずに ID とその項目だけを示して失敗として報告する",
      async (label, tamper) => {
        mockCreateStylePreset.mockImplementation(async (input) =>
          tamper(persistedFrom(input))
        );
        const manifestPath = writeWorkspace([ENTRY]);
        const { io, output } = createIo();

        const exitCode = await runRegisterStylePresets([manifestPath], io);

        expect(exitCode).toBe(1);
        const [, presetId] = mockUploadStylePresetImage.mock.calls[0];
        // 予定の表示(「カテゴリ: …」など)にも同じ語が出るので、NG の行そのものを見る
        const ngLine = output()
          .split("\n")
          .find((line) => line.includes("照合: NG"));
        expect(ngLine).toBeDefined();
        expect(ngLine).toContain(label);
        expect(ngLine).toContain(presetId);
        for (const other of VERIFIED_FIELD_LABELS.filter((l) => l !== label)) {
          expect(ngLine).not.toContain(other);
        }
        expect(mockDeleteStylePresetImage).not.toHaveBeenCalled();
      }
    );
  });

  describe("引数", () => {
    test("--help は使い方を標準出力に出して 0 を返し、DB にもストレージにも触れない", async () => {
      const { io, stdout } = createIo();

      const exitCode = await runRegisterStylePresets(["--help"], io);

      expect(exitCode).toBe(0);
      expect(stdout()).toContain("使い方");
      expectNoBoundaryTouched();
    });

    test("マニフェストの後ろに --help があっても、登録せずに使い方だけ出す", async () => {
      const manifestPath = writeWorkspace([ENTRY]);
      const { io, stdout } = createIo();

      const exitCode = await runRegisterStylePresets(
        [manifestPath, "--help"],
        io
      );

      expect(exitCode).toBe(0);
      expect(stdout()).toContain("使い方");
      expectNoBoundaryTouched();
    });

    /*
      ⭐ 知らないオプションを読み飛ばすと、--dry-run の打ち間違いがそのまま
      本番への登録になる。実在するマニフェストがあっても止めること。
    */
    test("打ち間違いのオプション(--dryrun)は、実在するマニフェストがあっても登録せずに止める", async () => {
      const manifestPath = writeWorkspace([ENTRY]);
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets(
        [manifestPath, "--dryrun"],
        io
      );

      expect(exitCode).toBe(1);
      expect(stderr()).toContain("--dryrun");
      expect(stderr()).toContain("使い方");
      expectNoBoundaryTouched();
    });

    test.each([
      ["マニフェストの指定が無い", [] as string[]],
      ["マニフェストが2つある", ["a.json", "b.json"]],
    ])("%s なら使い方を出して 1 を返す", async (_label, argv) => {
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets(argv, io);

      expect(exitCode).toBe(1);
      expect(stderr()).toContain("使い方");
      expectNoBoundaryTouched();
    });

    test("マニフェストのファイルが無ければ止める", async () => {
      const { io, stderr } = createIo();

      const exitCode = await runRegisterStylePresets(
        [path.join(dir, "missing.json")],
        io
      );

      expect(exitCode).toBe(1);
      expect(stderr()).toContain("missing.json");
      expectNoBoundaryTouched();
    });
  });
});

describe("detectImageMimeType", () => {
  test.each([
    ["png", "image/png"],
    ["jpeg", "image/jpeg"],
    ["webp", "image/webp"],
  ] as const)("本物の %s 画像を中身から判定する", async (format, expected) => {
    await expect(detectImageMimeType(await realImage(format))).resolves.toBe(
      expected
    );
  });

  test("本物の GIF は対応外として null", async () => {
    await expect(detectImageMimeType(realGif)).resolves.toBeNull();
  });

  test("先頭だけ PNG で中身が壊れたものは null", async () => {
    await expect(
      detectImageMimeType(Buffer.concat([PNG_SIGNATURE, Buffer.alloc(64, 7)]))
    ).resolves.toBeNull();
  });

  test("画像でないバイト列は null", async () => {
    await expect(
      detectImageMimeType(Buffer.from("not an image at all"))
    ).resolves.toBeNull();
  });
});
