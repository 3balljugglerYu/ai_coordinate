import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "@/lib/env";
import {
  normalizeStylePresetOptionalPrompt,
  normalizeStylePresetPrompt,
  normalizeStylePresetTitle,
  type StylePresetAdmin,
} from "@/features/style-presets/lib/schema";
import { validateStylePresetImageFile } from "@/features/style-presets/lib/validate-style-preset-image-file";
import {
  deleteStylePresetImage,
  uploadStylePresetImage,
} from "@/features/style-presets/lib/style-preset-storage";
import {
  createStylePreset,
  getStylePresetForAdminById,
  listStylePresetsForAdmin,
} from "@/features/style-presets/lib/style-preset-repository";
import {
  getPresetCategoryByKey,
  type PresetCategoryAdmin,
} from "@/features/style-presets/lib/preset-category-repository";
import {
  DEFAULT_CATEGORY_KEY,
  DEFAULT_SORT_ORDER,
  DEFAULT_STATUS,
  parseStylePresetManifest,
  type StylePresetManifestEntry,
} from "./style-preset-manifest";

/*
  管理画面の「新規作成」(app/api/admin/style-presets/route.ts の POST)と同じ部品で
  スタイルプリセットを登録する。画像の WebP 変換と保存は uploadStylePresetImage、
  slug の採番とプロンプトの正規化と保存は createStylePreset が行う。

  管理 API との違い:
  - ログインの代わりに service role key で接続する(入口の scripts/register-style-presets.mjs)
  - サムネイル1枚のプリセットだけを扱う(参考画像の要る dual は管理画面で登録する)
  - 保存後のキャッシュ失効(revalidateStylePresets)は呼べない。Next の中でしか動かないため。
    公開側の一覧は cacheLife("minutes") なので、数分で自然に反映される
  - 人が画面で確かめない代わりに、書く前に全件を確かめ、保存後に DB の中身を入力と照合する
  - 作成に失敗したとき、行が保存されていないと確かめてから画像を消す
*/

export interface CliIo {
  log: (message: string) => void;
  error: (message: string) => void;
}

const consoleIo: CliIo = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
};

const USAGE = [
  "使い方: node scripts/register-style-presets.mjs <manifest.json> [--dry-run]",
  "",
  "ローカルの画像とプロンプトから、スタイルプリセットを本番に登録します。",
  "管理画面の「新規作成」と同じ部品(画像の WebP 変換・保存、create_style_preset)を使います。",
  "接続には .env.local の NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY だけを読みます。",
  "",
  "manifest.json はプリセットの配列です(パスは manifest.json の場所から):",
  '  [{ "title": "...", "image": "image.png", "stylingPromptFile": "styling.txt",',
  '     "backgroundPromptFile": "background.txt" }]',
  "",
  "  title                 タイトル(必須)",
  "  image                 サムネイル画像。PNG / JPEG / WebP、5MB 以下(必須)",
  "  stylingPromptFile     Styling Prompt のテキストファイル(必須)",
  "  backgroundPromptFile  Background Prompt のテキストファイル(省略可)",
  `  category              カテゴリのキー(省略時: ${DEFAULT_CATEGORY_KEY} = 研究中のプロンプト)`,
  `  status                draft / pending / published / rejected(省略時: ${DEFAULT_STATUS})。category を書いたら必須`,
  `  sortOrder             並び順。0 以上の整数(省略時: ${DEFAULT_SORT_ORDER})`,
  "",
  "  --dry-run  確かめるだけで登録しない",
  "",
  "全件(ファイル・画像が読めるか・カテゴリ・並び順)を確かめてから登録します。",
  "同じカテゴリに同じタイトルがあれば飛ばします。",
  "サイトの一覧には数分で反映されます(キャッシュの自然な更新を待つため)。",
].join("\n");

/**
 * 既存プリセットの一覧が欠けずに取れる上限。listStylePresetsForAdmin は件数の上限を
 * 付けずに取るので、これを超えると PostgREST の上限で黙って欠ける。
 */
const LIST_ROW_LIMIT = 1000;

const MIME_TYPE_BY_FORMAT = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
} as const;

type SupportedMimeType =
  (typeof MIME_TYPE_BY_FORMAT)[keyof typeof MIME_TYPE_BY_FORMAT];

/**
 * 画像の形式を中身から判定する。PNG / JPEG / WebP 以外と、読めない(壊れた)画像は null。
 *
 * 管理画面ではブラウザが拡張子から形式を決めるが、ここでは拡張子を信用しない。
 * ⭐ 先頭バイトだけで判定すると、壊れた画像が確認を通り抜け、登録の途中
 *    (WebP への変換)で止まる。sharp でヘッダーまで読んで確かめる。
 */
export async function detectImageMimeType(
  bytes: Uint8Array
): Promise<SupportedMimeType | null> {
  try {
    const { format } = await sharp(bytes).metadata();
    return format && Object.hasOwn(MIME_TYPE_BY_FORMAT, format)
      ? MIME_TYPE_BY_FORMAT[format as keyof typeof MIME_TYPE_BY_FORMAT]
      : null;
  } catch {
    return null;
  }
}

type ParsedArgs =
  | { kind: "help" }
  | { kind: "invalid"; message: string }
  | { kind: "run"; manifestPath: string; dryRun: boolean };

function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { kind: "help" };
  }

  let dryRun = false;
  const positional: string[] = [];
  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    // ⭐ 知らないオプションを読み飛ばすと、--dry-run の打ち間違いが
    //    そのまま本番への登録になる
    if (arg.startsWith("-")) {
      return { kind: "invalid", message: `知らないオプションです: ${arg}` };
    }
    positional.push(arg);
  }

  if (positional.length !== 1) {
    return {
      kind: "invalid",
      message: "マニフェスト(JSON)のパスを1つだけ指定してください",
    };
  }
  return { kind: "run", manifestPath: path.resolve(positional[0]), dryRun };
}

interface PreparedEntry {
  /** 「1件目「タイトル」」の形。出力の行頭に付ける */
  label: string;
  entry: StylePresetManifestEntry;
  category: PresetCategoryAdmin;
  file: File;
  stylingPrompt: string;
  backgroundPrompt: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readTextFile(
  filePath: string,
  problems: string[]
): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    problems.push(`ファイルが読めません: ${filePath}`);
    return null;
  }
}

async function readImageFile(
  imagePath: string,
  problems: string[]
): Promise<File | null> {
  let bytes: Buffer;
  try {
    bytes = await readFile(imagePath);
  } catch {
    problems.push(`画像が読めません: ${imagePath}`);
    return null;
  }

  const mimeType = await detectImageMimeType(bytes);
  if (!mimeType) {
    problems.push(
      `画像が PNG / JPEG / WebP ではないか、壊れています: ${imagePath}`
    );
    return null;
  }

  const file = new File([new Uint8Array(bytes)], path.basename(imagePath), {
    type: mimeType,
  });
  // 管理 API と同じ検査(形式の許可リストと 5MB の上限)
  const fileError = validateStylePresetImageFile(file);
  if (fileError) {
    problems.push(`${fileError}: ${imagePath}`);
    return null;
  }
  return file;
}

function describeCategoryProblem(
  entry: StylePresetManifestEntry,
  category: PresetCategoryAdmin | null
): string | null {
  const key = entry.categoryKey;
  if (!category) {
    return `カテゴリが見つかりません: ${key}`;
  }
  // 管理 API と同じく、inactive なカテゴリには新しく割り当てない
  if (!category.isActive) {
    return `無効なカテゴリには登録できません: ${key}`;
  }
  // 既定が dual のカテゴリは参考画像(image_1)が要る。サムネイル1枚では同じものを作れない
  if (category.defaultImageInputMode !== "single") {
    return `「${category.displayNameJa}」は参考画像が要るカテゴリのため、管理画面から登録してください`;
  }
  // ⭐ 既定の published が安全なのは、運営だけに見えるカテゴリだから。公開範囲は
  //    管理画面で変えられるので、既定に頼るときはその場で確かめる
  if (!entry.statusSpecified && category.visibility !== "admin_only") {
    return `「${category.displayNameJa}」は一般公開のカテゴリです。公開状態を既定(${DEFAULT_STATUS})に任せられないので、status を書いてください`;
  }
  return null;
}

/**
 * 全件のファイルとカテゴリを確かめる。
 *
 * ⭐ 書き込む前に全件を確かめる。1件ずつ確かめて書くと、2件目で止まったときに
 *    1件目だけが本番に入る。
 */
async function prepareEntries(
  entries: readonly StylePresetManifestEntry[]
): Promise<{ prepared: PreparedEntry[]; errors: string[] }> {
  const prepared: PreparedEntry[] = [];
  const errors: string[] = [];
  const categories = new Map<string, PresetCategoryAdmin | null>();
  const seen = new Set<string>();

  for (const [index, entry] of entries.entries()) {
    const title = normalizeStylePresetTitle(entry.title);
    const label = `${index + 1}件目「${title}」`;
    const problems: string[] = [];

    if (title === "") {
      problems.push("タイトルが空です");
    }

    const duplicateKey = `${entry.categoryKey}\n${title}`;
    if (seen.has(duplicateKey)) {
      problems.push(
        "同じマニフェストに、同じカテゴリ・同じタイトルの件がもう1つあります"
      );
    }
    seen.add(duplicateKey);

    const file = await readImageFile(entry.imagePath, problems);

    const stylingPrompt = await readTextFile(entry.stylingPromptPath, problems);
    if (
      stylingPrompt !== null &&
      normalizeStylePresetPrompt(stylingPrompt) === ""
    ) {
      problems.push(`Styling Prompt が空です: ${entry.stylingPromptPath}`);
    }

    const backgroundPrompt =
      entry.backgroundPromptPath === null
        ? null
        : await readTextFile(entry.backgroundPromptPath, problems);
    // 背景のファイルを指定したのに中身が空なら、書き間違いとみなす(黙って背景を落とさない)
    if (
      entry.backgroundPromptPath !== null &&
      backgroundPrompt !== null &&
      normalizeStylePresetOptionalPrompt(backgroundPrompt) === null
    ) {
      problems.push(`Background Prompt が空です: ${entry.backgroundPromptPath}`);
    }

    if (!categories.has(entry.categoryKey)) {
      categories.set(
        entry.categoryKey,
        await getPresetCategoryByKey(entry.categoryKey)
      );
    }
    const category = categories.get(entry.categoryKey) ?? null;
    const categoryProblem = describeCategoryProblem(entry, category);
    if (categoryProblem) {
      problems.push(categoryProblem);
    }

    // problems が空なら file / stylingPrompt / category は揃っている
    // (欠けるときは必ず problems に理由を積んでいる)
    if (problems.length > 0 || !file || stylingPrompt === null || !category) {
      errors.push(...problems.map((problem) => `${label}: ${problem}`));
      continue;
    }

    prepared.push({
      label,
      entry,
      category,
      file,
      stylingPrompt,
      backgroundPrompt,
    });
  }

  return { prepared, errors };
}

/** 同じカテゴリに同じタイトルのプリセットがあれば返す。 */
function findExisting(
  existing: readonly StylePresetAdmin[],
  item: PreparedEntry
): StylePresetAdmin | undefined {
  const title = normalizeStylePresetTitle(item.entry.title);
  return existing.find(
    (preset) => preset.category.id === item.category.id && preset.title === title
  );
}

function describePlan(item: PreparedEntry): string {
  const visibility =
    item.category.visibility === "admin_only" ? "運営のみ" : "一般公開";
  const sizeMb = (item.file.size / 1024 / 1024).toFixed(1);
  return [
    `カテゴリ ${item.category.displayNameJa}(${item.category.key}・${visibility})`,
    `公開状態 ${item.entry.status}`,
    `並び順 ${item.entry.sortOrder}`,
    `画像 ${item.file.name}(${item.file.type}, ${sizeMb}MB)`,
  ].join(" / ");
}

/** 保存された内容を入力と見比べ、食い違った項目の名前(管理画面の表記)を返す。 */
function findMismatches(
  item: PreparedEntry,
  thumbnailImageUrl: string,
  created: StylePresetAdmin
): string[] {
  const checks: Array<[label: string, actual: unknown, expected: unknown]> = [
    ["タイトル", created.title, normalizeStylePresetTitle(item.entry.title)],
    [
      "Styling Prompt",
      created.stylingPrompt,
      normalizeStylePresetPrompt(item.stylingPrompt),
    ],
    [
      "Background Prompt",
      created.backgroundPrompt,
      normalizeStylePresetOptionalPrompt(item.backgroundPrompt),
    ],
    ["公開状態", created.status, item.entry.status],
    ["カテゴリ", created.category.id, item.category.id],
    ["並び順", created.sortOrder, item.entry.sortOrder],
    ["サムネイル", created.thumbnailImageUrl, thumbnailImageUrl],
  ];
  return checks
    .filter(([, actual, expected]) => actual !== expected)
    .map(([label]) => label);
}

async function removeUploadedImage(storagePath: string, io: CliIo) {
  try {
    await deleteStylePresetImage(storagePath);
  } catch (error) {
    io.error(
      `  アップロードした画像を消せませんでした。手で消してください: style_presets/${storagePath}(${errorMessage(error)})`
    );
  }
}

/**
 * 作成が失敗したあと、先に置いた画像を片付ける。
 *
 * ⭐ create_style_preset が行を保存したあと、読み直し(getStylePresetForAdminById)で
 *    失敗していることがある。行があるのに画像を消すと、画像の無いプリセットが
 *    (既定なら公開のまま)残り、流し直しても重複として飛ばされて直らない。
 *    行が無いと確かめられたときだけ消す。
 */
async function cleanUpAfterFailedCreate(
  presetId: string,
  storagePath: string,
  io: CliIo
): Promise<void> {
  let saved: StylePresetAdmin | null;
  try {
    saved = await getStylePresetForAdminById(presetId);
  } catch (error) {
    io.error(
      `  行が保存されたか確かめられないため、画像は残しています(${errorMessage(error)})。管理画面で id=${presetId} を確かめてください`
    );
    return;
  }
  if (saved) {
    io.error(
      `  行は保存されています。画像は消していません。管理画面で id=${presetId} を確かめてください`
    );
    return;
  }
  await removeUploadedImage(storagePath, io);
}

/** 1件を登録して照合する。失敗したら理由を出して false を返す。 */
async function registerOne(item: PreparedEntry, io: CliIo): Promise<boolean> {
  const presetId = randomUUID();

  let uploaded: Awaited<ReturnType<typeof uploadStylePresetImage>>;
  try {
    uploaded = await uploadStylePresetImage(item.file, presetId, randomUUID());
  } catch (error) {
    io.error(
      `${item.label}: 画像のアップロードに失敗しました: ${errorMessage(error)}`
    );
    return false;
  }

  let created: StylePresetAdmin;
  try {
    created = await createStylePreset({
      id: presetId,
      title: item.entry.title,
      stylingPrompt: item.stylingPrompt,
      backgroundPrompt: item.backgroundPrompt,
      thumbnailImageUrl: uploaded.imageUrl,
      thumbnailStoragePath: uploaded.storagePath,
      thumbnailWidth: uploaded.width,
      thumbnailHeight: uploaded.height,
      sortOrder: item.entry.sortOrder,
      status: item.entry.status,
      // 管理画面ではログイン中の運営の ID が入る。スクリプトには利用者がいないので空にする
      // (並び替えで動くほかのプリセットの updated_by は、空なら元の値のまま残る)
      createdBy: null,
      categoryId: item.category.id,
      imageInputMode: "single",
      dualReferenceSource: "admin",
    });
  } catch (error) {
    io.error(`${item.label}: 登録に失敗しました: ${errorMessage(error)}`);
    await cleanUpAfterFailedCreate(presetId, uploaded.storagePath, io);
    return false;
  }

  // ⭐ 食い違っても消さない。行はもう DB にあり、消すのは取り返しのつかない操作なので、
  //    人が確かめられるよう ID と食い違った項目を出して止める
  const mismatches = findMismatches(item, uploaded.imageUrl, created);
  if (mismatches.length > 0) {
    io.error(
      `${item.label}: 照合: NG(${mismatches.join("・")}) id=${created.id}`
    );
    io.error("  登録は残しています。管理画面で中身を確かめてください");
    return false;
  }

  io.log(`${item.label}: 登録しました id=${created.id} slug=${created.slug}`);
  io.log(
    "  照合: OK(タイトル・Styling Prompt・Background Prompt・公開状態・カテゴリ・並び順・サムネイル)"
  );
  return true;
}

async function registerFromManifest(
  manifestPath: string,
  dryRun: boolean,
  io: CliIo
): Promise<number> {
  let manifestText: string;
  try {
    manifestText = await readFile(manifestPath, "utf8");
  } catch {
    io.error(`マニフェストが読めません: ${manifestPath}`);
    return 1;
  }

  const manifest = parseStylePresetManifest(
    manifestText,
    path.dirname(manifestPath)
  );
  if (!manifest.ok) {
    manifest.errors.forEach((message) => io.error(message));
    return 1;
  }

  // createAdminClient が実際につなぐ先(lib/env が読み込み時に固定した値)を示す
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  io.log(
    `接続先: ${supabaseUrl ? new URL(supabaseUrl).host : "(NEXT_PUBLIC_SUPABASE_URL が未設定)"}`
  );

  const { prepared, errors } = await prepareEntries(manifest.entries);
  if (errors.length > 0) {
    errors.forEach((message) => io.error(message));
    io.error("不正な件があるため、1件も登録していません");
    return 1;
  }

  const existing = await listStylePresetsForAdmin();
  // ⭐ 欠けた一覧では、重複も並び順の上限も確かめられない
  if (existing.length >= LIST_ROW_LIMIT) {
    io.error(
      `既存のプリセットが ${LIST_ROW_LIMIT} 件に届き、一覧が欠けているおそれがあります。重複と並び順を確かめられないため、1件も登録していません(一覧の取得をページ送りにしてください)`
    );
    return 1;
  }

  // ⭐ 並び順は全カテゴリ通しの位置。RPC は「ほかのプリセットの件数」を超える値を
  //    黙って丸める(place_style_preset_at_order)ので、照合で NG になる前に止める。
  //    上限は実行前の件数で見る(同じ実行で先に登録する件は数えない安全側の決めごと)
  const orderErrors = prepared
    .filter((item) => item.entry.sortOrder > existing.length)
    .map(
      (item) =>
        `${item.label}: 並び順 ${item.entry.sortOrder} は大きすぎます。今のプリセットは ${existing.length} 件なので、0〜${existing.length} で指定してください`
    );
  if (orderErrors.length > 0) {
    orderErrors.forEach((message) => io.error(message));
    io.error("不正な件があるため、1件も登録していません");
    return 1;
  }

  const targets: PreparedEntry[] = [];
  for (const item of prepared) {
    const duplicate = findExisting(existing, item);
    if (duplicate) {
      io.log(
        `${item.label}: スキップ(同じカテゴリに同じタイトルがあります: ${duplicate.slug} / ${duplicate.id})`
      );
      continue;
    }
    io.log(`${item.label}: ${describePlan(item)}`);
    targets.push(item);
  }

  if (dryRun) {
    io.log("dry-run のため登録していません");
    return 0;
  }

  for (const item of targets) {
    if (!(await registerOne(item, io))) {
      return 1;
    }
  }
  if (targets.length > 0) {
    io.log("サイトの一覧には数分で反映されます(キャッシュの自然な更新を待つため)");
  }
  return 0;
}

/**
 * マニフェストに書いたプリセットを登録し、終了コードを返す(0 = 成功)。
 *
 * 入口の scripts/register-style-presets.mjs から呼ぶ。テストでは io を差し替える。
 */
export async function runRegisterStylePresets(
  argv: readonly string[],
  io: CliIo = consoleIo
): Promise<number> {
  const args = parseArgs(argv);
  if (args.kind === "help") {
    io.log(USAGE);
    return 0;
  }
  if (args.kind === "invalid") {
    io.error(args.message);
    io.error(USAGE);
    return 1;
  }

  try {
    return await registerFromManifest(args.manifestPath, args.dryRun, io);
  } catch (error) {
    io.error(`止めました: ${errorMessage(error)}`);
    return 1;
  }
}
