"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { PresetCategoryAdmin } from "@/features/style-presets/lib/preset-category-repository";
import { DEFAULT_GENERATION_MODEL } from "@/features/generation/types";
import { getModelDisplayInfo } from "@/features/generation/lib/model-display";
import {
  isMountLayoutKey,
  type NormalizedSlotRect,
} from "@/features/collections/lib/mount-layouts";
import {
  joinSlots,
  outOfBoundsIndices,
  seedSlots,
  setSlotCount,
  splitSlots,
} from "@/features/collections/lib/slot-edit-geometry";
import {
  EXPLICIT_OUTPUT_ASPECT_RATIOS,
  type StyleOutputAspectRatioMode,
} from "@/shared/generation/style-output-aspect-ratio";
import { MountSlotEditor } from "@/features/preset-categories/components/MountSlotEditor";
import { ProgressModalColorPreview } from "@/features/preset-categories/components/ProgressModalColorPreview";

type Mode = "create" | "edit";

/** 「生成モデル選択を表示」OFF 時にサーバー側で使われる既定モデルの表示名。 */
const DEFAULT_GENERATION_MODEL_LABEL =
  getModelDisplayInfo(DEFAULT_GENERATION_MODEL).displayName;

interface Props {
  mode: Mode;
  initial?: PresetCategoryAdmin;
  /**
   * initial の collectionDisplayStartsAt / EndsAt を datetime-local 形式 (JST)
   * に変換した文字列。サーバー Component で formatDatetimeLocalJst() 等を使い
   * 算出して渡す。`new Date()` を Client 側の useState 初期化で呼ぶと SSR/CSR
   * 間でタイムゾーン差により Hydration Mismatch が起きるため、サーバー側で
   * 決め打ち JST 変換しておく。
   */
  initialCollectionDisplayStartsAtLocal?: string;
  initialCollectionDisplayEndsAtLocal?: string;
  /**
   * 解放ゲートの「前提カテゴリ」selectで使う候補。コレクションシリーズのみ・
   * 編集時は自身を除外したものをサーバー側で渡す。省略時は空配列(ゲートなしのみ)。
   */
  prerequisiteOptions?: { key: string; displayNameJa: string }[];
}

interface FormState {
  key: string;
  displayNameJa: string;
  displayNameEn: string;
  badgeColor: string;
  badgeTextColor: string;
  skipBasePrefix: boolean;
  defaultImageInputMode: "single" | "dual";
  outputAspectRatioMode: StyleOutputAspectRatioMode;
  userGuidanceJa: string;
  userGuidanceEn: string;
  showSourceImageTypeControl: boolean;
  showBackgroundChangeControl: boolean;
  showGenerationModelControl: boolean;
  showUserPromptInput: boolean;
  userPromptLabel: string;
  userPromptPlaceholder: string;
  userPromptMaxLength: number | null;
  visibility: "public" | "admin_only";
  isCollectionSeries: boolean;
  /** Xシェア抽選プレゼントの対象カテゴリか(受付期間は企画表示期間を流用) */
  lotteryTarget: boolean;
  completionThreshold: number | null;
  /** コレクション完走時に付与するペルコイン数。0/null=報酬なし */
  completionRewardPercoins: number | null;
  /** 完走表示モード: mount(単一台紙) / book(めくれる日記帳) */
  completionViewMode: "mount" | "book";
  /** book 表示の表紙(0ページ目)画像 storage path。null=簡易表紙 */
  bookCoverPath: string | null;
  /** 解放の前提カテゴリ key(完走者限定)。null=ゲートなし */
  unlockPrerequisiteKey: string | null;
  /** 段階解放の単位(正の整数)。null=最初から全部解放 */
  progressiveBatchSize: number | null;
  /** 順番固定の1つずつ解放(sequential unlock)。true で先頭=表紙から昇順に順次解放 */
  sequentialUnlock: boolean;
  mountTemplatePath: string | null;
  mountLayout: "" | "grid_3" | "grid_4" | "grid_6";
  /** カスタム枠(正規化矩形配列)。null なら mountLayout プリセットを使用 */
  mountSlots: NormalizedSlotRect[] | null;
  /** 台紙テンプレ実寸(px)。アップロード時に取得。枠エディタのアスペクト換算に使う */
  mountTemplateWidth: number | null;
  mountTemplateHeight: number | null;
  collectionCharacterPath: string | null;
  /** datetime-local 形式("YYYY-MM-DDTHH:mm")。空文字 = 未設定 */
  collectionDisplayStartsAt: string;
  collectionDisplayEndsAt: string;
  /** 進捗モーダルの土台フレーム画像パス(public バケット)。null なら DB 駆動レイアウト無効 */
  progressModalFramePath: string | null;
  progressModalFrameWidth: number | null;
  progressModalFrameHeight: number | null;
  /** 進捗モーダルのシール枠(正規化矩形配列)。 */
  progressModalSlots: NormalizedSlotRect[] | null;
  /** 進捗モーダルのボタン領域(単一の正規化矩形)。 */
  progressModalButton: NormalizedSlotRect | null;
  /** 進捗モーダルの中央画像領域(単一の正規化矩形)。表示画像はキャラ画像を流用。 */
  progressModalCenter: NormalizedSlotRect | null;
  /** 進捗リングの色(#RRGGBB)。null=従来デフォルト配色 */
  progressModalRingColor: string | null;
  /** %達成バッジの色(#RRGGBB)。null=従来デフォルト配色 */
  progressModalBadgeColor: string | null;
  /** %達成バッジの文字色(#RRGGBB)。null=従来デフォルト配色 */
  progressModalBadgeTextColor: string | null;
  /** %達成バッジの背景色(#RRGGBB)。null=従来デフォルト配色 */
  progressModalBadgeBgColor: string | null;
  /** CTAボタンの塗り色(#RRGGBB)。null=従来のオレンジ */
  progressModalButtonColor: string | null;
  /** CTAボタンの文字色(#RRGGBB)。null=白 */
  progressModalButtonTextColor: string | null;
  /** 解放お知らせ初回モーダルのヒーロー画像パス(public バケット)。null=固定画像 */
  unlockAnnouncementHeroPath: string | null;
  /** 解放お知らせ初回モーダルの本文。null=現行ハードコード文 */
  unlockAnnouncementInitialBody: string | null;
  /** 解放お知らせ段階解放モーダルの本文。null=現行ハードコード文 */
  unlockAnnouncementDripBody: string | null;
  /** 解放お知らせのボタン/アクセント色(#RRGGBB)。null=#C670FF */
  unlockAnnouncementAccentColor: string | null;
  /** 解放お知らせのボタン hover 色(#RRGGBB)。null=#B14DF0 */
  unlockAnnouncementAccentHoverColor: string | null;
  /** 解放お知らせの見出し文字色(#RRGGBB)。null=#8B3DC9 */
  unlockAnnouncementTitleColor: string | null;
  /** 解放お知らせの NEW ピル/淡い面の背景色(#RRGGBB)。null=#F3E0FF */
  unlockAnnouncementSoftColor: string | null;
  displayOrder: number;
  isActive: boolean;
}

/**
 * datetime-local 入力値(JST 局所時刻) → ISO 日時。空文字/不正は null。
 * ブラウザの `new Date("YYYY-MM-DDTHH:mm")` はブラウザのローカル TZ で
 * 解釈される。admin は JST 前提のため、JST→UTC 換算が一意に決まる。
 * (この関数は submit 時にのみクライアントで呼ばれるので Hydration の影響なし)
 */
function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toFormState(
  initial?: PresetCategoryAdmin,
  initialDates?: { startsAtLocal?: string; endsAtLocal?: string },
): FormState {
  return {
    key: initial?.key ?? "",
    displayNameJa: initial?.displayNameJa ?? "",
    displayNameEn: initial?.displayNameEn ?? "",
    badgeColor: initial?.badgeColor ?? "#1f2937",
    badgeTextColor: initial?.badgeTextColor ?? "#ffffff",
    skipBasePrefix: initial?.skipBasePrefix ?? false,
    defaultImageInputMode: initial?.defaultImageInputMode ?? "single",
    outputAspectRatioMode: initial?.outputAspectRatioMode ?? "source",
    userGuidanceJa: initial?.userGuidanceJa ?? "",
    userGuidanceEn: initial?.userGuidanceEn ?? "",
    showSourceImageTypeControl: initial?.showSourceImageTypeControl ?? true,
    showBackgroundChangeControl: initial?.showBackgroundChangeControl ?? true,
    showGenerationModelControl: initial?.showGenerationModelControl ?? true,
    showUserPromptInput: initial?.showUserPromptInput ?? false,
    userPromptLabel: initial?.userPromptLabel ?? "",
    userPromptPlaceholder: initial?.userPromptPlaceholder ?? "",
    userPromptMaxLength: initial?.userPromptMaxLength ?? null,
    visibility: initial?.visibility ?? "admin_only",
    isCollectionSeries: initial?.isCollectionSeries ?? false,
    lotteryTarget: initial?.lotteryTarget ?? false,
    completionThreshold: initial?.completionThreshold ?? null,
    completionRewardPercoins: initial?.completionRewardPercoins ?? null,
    completionViewMode: initial?.completionViewMode ?? "mount",
    bookCoverPath: initial?.bookCoverPath ?? null,
    unlockPrerequisiteKey: initial?.unlockPrerequisiteKey ?? null,
    progressiveBatchSize: initial?.progressiveBatchSize ?? null,
    sequentialUnlock: initial?.sequentialUnlock ?? false,
    mountTemplatePath: initial?.mountTemplatePath ?? null,
    mountLayout: initial?.mountLayout ?? "",
    mountSlots: initial?.mountSlots ?? null,
    mountTemplateWidth: initial?.mountTemplateWidth ?? null,
    mountTemplateHeight: initial?.mountTemplateHeight ?? null,
    collectionCharacterPath: initial?.collectionCharacterPath ?? null,
    // Hydration Mismatch を避けるため、サーバー側で JST 変換済みの文字列を
    // props 経由で受け取る (props が無いケース = create mode のため空文字)。
    collectionDisplayStartsAt: initialDates?.startsAtLocal ?? "",
    collectionDisplayEndsAt: initialDates?.endsAtLocal ?? "",
    progressModalFramePath: initial?.progressModalFramePath ?? null,
    progressModalFrameWidth: initial?.progressModalFrameWidth ?? null,
    progressModalFrameHeight: initial?.progressModalFrameHeight ?? null,
    progressModalSlots: initial?.progressModalSlots ?? null,
    progressModalButton: initial?.progressModalButton ?? null,
    progressModalCenter: initial?.progressModalCenter ?? null,
    progressModalRingColor: initial?.progressModalRingColor ?? null,
    progressModalBadgeColor: initial?.progressModalBadgeColor ?? null,
    progressModalBadgeTextColor: initial?.progressModalBadgeTextColor ?? null,
    progressModalBadgeBgColor: initial?.progressModalBadgeBgColor ?? null,
    progressModalButtonColor: initial?.progressModalButtonColor ?? null,
    progressModalButtonTextColor:
      initial?.progressModalButtonTextColor ?? null,
    unlockAnnouncementHeroPath: initial?.unlockAnnouncementHeroPath ?? null,
    unlockAnnouncementInitialBody: initial?.unlockAnnouncementInitialBody ?? null,
    unlockAnnouncementDripBody: initial?.unlockAnnouncementDripBody ?? null,
    unlockAnnouncementAccentColor: initial?.unlockAnnouncementAccentColor ?? null,
    unlockAnnouncementAccentHoverColor:
      initial?.unlockAnnouncementAccentHoverColor ?? null,
    unlockAnnouncementTitleColor: initial?.unlockAnnouncementTitleColor ?? null,
    unlockAnnouncementSoftColor: initial?.unlockAnnouncementSoftColor ?? null,
    displayOrder: initial?.displayOrder ?? 0,
    isActive: initial?.isActive ?? true,
  };
}

/** generated-images(public バケット)に保存されたキャラ画像の公開URL */
function characterPublicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-images/${path}`;
}

/** private バケットの台紙テンプレを admin API 経由で配信するURL */
function mountTemplatePreviewUrl(path: string): string {
  return `/api/admin/collection-mount-template?path=${encodeURIComponent(path)}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

const HEX6_RE = /^#[0-9A-Fa-f]{6}$/;

/**
 * 色入力フィールド(スウォッチ + HEX テキスト欄 + 「デフォルトに戻す」)。
 * value=null は「未設定(デフォルト配色)」。HEX テキストは自由入力でき、
 * 有効な #RRGGBB になったときだけ確定する(空にすると null=デフォルトに戻る)。
 * ネイティブの type=color パレットは RGB/HEX 表記を制御できないため、
 * HEX を直接読み書きできるテキスト欄を併設する。
 */
function ColorField({
  label,
  value,
  defaultSwatch,
  onChange,
}: {
  label: string;
  value: string | null;
  defaultSwatch: string;
  onChange: (value: string | null) => void;
}) {
  const [text, setText] = useState(value ?? "");
  // スウォッチ操作・リセット等で外部 value が変わったらテキストも同期する。
  // useEffect ではなく「レンダー中に派生 state を調整」する公式パターンを使う。
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value ?? "");
  }

  const handleText = (raw: string) => {
    setText(raw);
    const t = raw.trim();
    if (t === "") {
      onChange(null);
      return;
    }
    const norm = (t.startsWith("#") ? t : `#${t}`).toUpperCase();
    if (HEX6_RE.test(norm)) {
      onChange(norm);
    }
    // 途中入力(無効な hex)は確定しない。確定済みの値は維持される。
  };

  return (
    <div className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={value ?? defaultSwatch}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-10 w-16 rounded-md border border-slate-300"
          aria-label={`${label}(スウォッチ)`}
        />
        <input
          type="text"
          value={text}
          onChange={(e) => handleText(e.target.value)}
          placeholder="#RRGGBB"
          maxLength={7}
          spellCheck={false}
          className="h-10 w-28 rounded-md border border-slate-300 px-2 font-mono text-sm uppercase"
          aria-label={`${label}(HEX)`}
        />
        {value == null ? (
          <span className="text-xs text-slate-500">未設定(デフォルト配色)</span>
        ) : (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            デフォルトに戻す
          </button>
        )}
      </div>
    </div>
  );
}

export function AdminPresetCategoryFormClient({
  mode,
  initial,
  initialCollectionDisplayStartsAtLocal,
  initialCollectionDisplayEndsAtLocal,
  prerequisiteOptions = [],
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() =>
    toFormState(initial, {
      startsAtLocal: initialCollectionDisplayStartsAtLocal,
      endsAtLocal: initialCollectionDisplayEndsAtLocal,
    }),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [uploadingCharacter, setUploadingCharacter] = useState(false);
  const [uploadingModalFrame, setUploadingModalFrame] = useState(false);
  const [uploadingUnlockHero, setUploadingUnlockHero] = useState(false);

  async function handleUnlockHeroUpload(file: File) {
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(form.key.trim())) {
      setError("ヒーロー画像をアップロードする前に key を入力してください");
      return;
    }
    setUploadingUnlockHero(true);
    setError(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/admin/collection-unlock-hero", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryKey: form.key.trim(), imageBase64 }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        path?: string;
        error?: string;
      };
      if (!res.ok || !payload.path) {
        setError(payload.error ?? "ヒーロー画像のアップロードに失敗しました");
        return;
      }
      update("unlockAnnouncementHeroPath", payload.path);
    } catch (err) {
      console.error(
        "[AdminPresetCategoryFormClient] unlock hero upload failed:",
        err,
      );
      setError("ヒーロー画像のアップロードに失敗しました");
    } finally {
      setUploadingUnlockHero(false);
    }
  }

  async function handleCharacterUpload(file: File) {
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(form.key.trim())) {
      setError("キャラ画像をアップロードする前に key を入力してください");
      return;
    }
    setUploadingCharacter(true);
    setError(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/admin/collection-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryKey: form.key.trim(), imageBase64 }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        path?: string;
        error?: string;
      };
      if (!res.ok || !payload.path) {
        setError(payload.error ?? "キャラ画像のアップロードに失敗しました");
        return;
      }
      update("collectionCharacterPath", payload.path);
    } catch (err) {
      console.error("[AdminPresetCategoryFormClient] character upload failed:", err);
      setError("キャラ画像のアップロードに失敗しました");
    } finally {
      setUploadingCharacter(false);
    }
  }

  async function handleModalFrameUpload(file: File) {
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(form.key.trim())) {
      setError("モーダルフレームをアップロードする前に key を入力してください");
      return;
    }
    setUploadingModalFrame(true);
    setError(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/admin/collection-progress-modal-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryKey: form.key.trim(), imageBase64 }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        path?: string;
        width?: number;
        height?: number;
        error?: string;
      };
      if (!res.ok || !payload.path) {
        setError(payload.error ?? "モーダルフレームのアップロードに失敗しました");
        return;
      }
      // path と実寸をまとめて反映(実寸は枠エディタのアスペクト換算に使う)。
      // 差し替え時に別アスペクトの旧寸法が残らないよう、取得できなければ null にする。
      setForm((prev) => ({
        ...prev,
        progressModalFramePath: payload.path ?? null,
        progressModalFrameWidth: payload.width ?? null,
        progressModalFrameHeight: payload.height ?? null,
      }));
    } catch (err) {
      console.error(
        "[AdminPresetCategoryFormClient] modal frame upload failed:",
        err,
      );
      setError("モーダルフレームのアップロードに失敗しました");
    } finally {
      setUploadingModalFrame(false);
    }
  }

  async function handleTemplateUpload(file: File) {
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(form.key.trim())) {
      setError("台紙テンプレをアップロードする前に key を入力してください");
      return;
    }
    setUploadingTemplate(true);
    setError(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/admin/collection-mount-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryKey: form.key.trim(), imageBase64 }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        path?: string;
        width?: number;
        height?: number;
        error?: string;
      };
      if (!res.ok || !payload.path) {
        setError(payload.error ?? "台紙テンプレのアップロードに失敗しました");
        return;
      }
      // path と実寸をまとめて反映(実寸は枠エディタのアスペクト換算に使う)。
      // 台紙差し替え時に別アスペクトの旧寸法が残らないよう、取得できなければ null にする。
      setForm((prev) => ({
        ...prev,
        mountTemplatePath: payload.path ?? null,
        mountTemplateWidth: payload.width ?? null,
        mountTemplateHeight: payload.height ?? null,
      }));
    } catch (err) {
      console.error("[AdminPresetCategoryFormClient] template upload failed:", err);
      setError("台紙テンプレのアップロードに失敗しました");
    } finally {
      setUploadingTemplate(false);
    }
  }

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  /** 選択中のグリッドレイアウトから枠を seed し、N(threshold)も枠数に合わせる。 */
  function handleSeedSlots() {
    if (!isMountLayoutKey(form.mountLayout)) {
      setError("枠を初期化する前に台紙レイアウトを選択してください");
      return;
    }
    const seeded = seedSlots(form.mountLayout);
    setForm((prev) => ({
      ...prev,
      mountSlots: seeded,
      completionThreshold: seeded.length,
    }));
  }

  /** カスタム枠を破棄し、レイアウトのプリセットに戻す。 */
  function handleClearSlots() {
    update("mountSlots", null);
  }

  /**
   * 進捗モーダルのシール枠を「コンプリート必要数 N」に合わせて初期化する。
   * grid_6 を基準にしつつ、N 枠へ調整する(N>6 は余剰をデフォルト位置に追加、N<6 は末尾削除)。
   * 台紙(mount)と同じ setSlotCount を流用し、枠数=N を保証する。
   */
  function handleSeedModalSlots() {
    const n = form.completionThreshold;
    if (n === null || !Number.isFinite(n) || n < 1) {
      setError(
        "シール枠を初期化する前にコンプリート必要数(N)を入力してください",
      );
      return;
    }
    const seeded = joinSlots(setSlotCount(splitSlots(seedSlots("grid_6")), n));
    update("progressModalSlots", seeded);
  }

  /** 進捗モーダルのシール枠を破棄する。 */
  function handleClearModalSlots() {
    update("progressModalSlots", null);
  }

  /** 進捗モーダルのボタン領域をデフォルト位置(下部)で初期化する。 */
  function handleSeedModalButton() {
    update("progressModalButton", { x: 0.1, y: 0.85, w: 0.8, h: 0.09 });
  }

  /** 進捗モーダルのボタン領域を破棄する。 */
  function handleClearModalButton() {
    update("progressModalButton", null);
  }

  /** 進捗モーダルの中央画像領域をデフォルト位置(中央寄りの四角)で初期化する。 */
  function handleSeedModalCenter() {
    update("progressModalCenter", { x: 0.17, y: 0.21, w: 0.66, h: 0.44 });
  }

  /** 進捗モーダルの中央画像領域を破棄する。 */
  function handleClearModalCenter() {
    update("progressModalCenter", null);
  }

  /**
   * 台紙レイアウト変更。既存の枠調整があれば確認のうえ、そのレイアウトで枠を再生成する
   * (枠数=N も同期)。キャンセル時は選択を元に戻す(form.mountLayout を変えない)。
   * 調整がまだ無ければ即座に seed して枠エディタを表示する。
   */
  function handleLayoutChange(value: FormState["mountLayout"]) {
    if (value === "") {
      update("mountLayout", "");
      return;
    }
    const hasCustom = !!form.mountSlots && form.mountSlots.length > 0;
    if (
      hasCustom &&
      !confirm(`現在の枠調整を破棄して ${value} で枠を作り直しますか?`)
    ) {
      return; // 選択は据え置き(controlled なので元に戻る)
    }
    const seeded = seedSlots(value);
    setForm((prev) => ({
      ...prev,
      mountLayout: value,
      mountSlots: seeded,
      completionThreshold: seeded.length,
    }));
  }

  /**
   * コンプリート数 N 変更。カスタム枠(台紙 mount_slots / 進捗モーダル progress_modal_slots)が
   * あるときは、いずれも枠の数を N に増減する(既存枠は保持・増加分はデフォルト位置に追加・
   * 減少分は末尾を削除)。これにより「N=9 ならシール枠も9」が動的に保たれる。
   * カスタム枠が無ければ数値だけ更新する。
   */
  function handleThresholdChange(raw: string) {
    const n = raw === "" ? null : Math.floor(Number(raw));
    if (n === null || !Number.isFinite(n) || n < 1) {
      update("completionThreshold", n);
      return;
    }
    setForm((prev) => ({
      ...prev,
      completionThreshold: n,
      mountSlots:
        prev.mountSlots && prev.mountSlots.length > 0
          ? joinSlots(setSlotCount(splitSlots(prev.mountSlots), n))
          : prev.mountSlots,
      progressModalSlots:
        prev.progressModalSlots && prev.progressModalSlots.length > 0
          ? joinSlots(setSlotCount(splitSlots(prev.progressModalSlots), n))
          : prev.progressModalSlots,
    }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      // カスタム枠がある場合、枠数とコンプリート必要数 N を一致させる(API も検証する)。
      // 枠数を真値とし threshold を同期する。
      const effectiveThreshold =
        form.mountSlots && form.mountSlots.length > 0
          ? form.mountSlots.length
          : form.completionThreshold;

      if (
        form.isCollectionSeries &&
        form.mountSlots &&
        form.mountSlots.length > 0 &&
        form.completionThreshold !== null &&
        form.completionThreshold !== form.mountSlots.length
      ) {
        setError(
          `枠の数(${form.mountSlots.length})とコンプリート必要数 N(${form.completionThreshold})が一致していません`,
        );
        setBusy(false);
        return;
      }

      // 枠が台紙からはみ出している場合は保存しない(枠調整で台紙内に収める)
      if (form.isCollectionSeries && form.mountSlots) {
        const oob = outOfBoundsIndices(form.mountSlots);
        if (oob.length > 0) {
          setError(
            `枠 ${oob.map((i) => i + 1).join(", ")} が台紙からはみ出しています。枠調整で台紙内に収めてから保存してください。`,
          );
          setBusy(false);
          return;
        }
      }

      const body =
        mode === "create"
          ? {
              key: form.key.trim(),
              display_name_ja: form.displayNameJa.trim(),
              display_name_en: form.displayNameEn.trim(),
              badge_color: form.badgeColor,
              badge_text_color: form.badgeTextColor,
              skip_base_prefix: form.skipBasePrefix,
              default_image_input_mode: form.defaultImageInputMode,
              output_aspect_ratio_mode: form.outputAspectRatioMode,
              user_guidance_ja: form.userGuidanceJa.trim() || null,
              user_guidance_en: form.userGuidanceEn.trim() || null,
              show_source_image_type_control: form.showSourceImageTypeControl,
              show_background_change_control: form.showBackgroundChangeControl,
              show_generation_model_control: form.showGenerationModelControl,
              show_user_prompt_input: form.showUserPromptInput,
              user_prompt_label: form.userPromptLabel.trim() || null,
              user_prompt_placeholder: form.userPromptPlaceholder.trim() || null,
              user_prompt_max_length: form.userPromptMaxLength,
              visibility: form.visibility,
              is_collection_series: form.isCollectionSeries,
              lottery_target: form.lotteryTarget,
              completion_threshold: effectiveThreshold,
              completion_reward_percoins: form.completionRewardPercoins,
              completion_view_mode: form.completionViewMode,
              book_cover_path: form.bookCoverPath,
              unlock_prerequisite_key: form.unlockPrerequisiteKey,
              progressive_batch_size: form.progressiveBatchSize,
              sequential_unlock: form.sequentialUnlock,
              mount_template_path: form.mountTemplatePath,
              mount_layout: form.mountLayout === "" ? null : form.mountLayout,
              mount_slots: form.mountSlots,
              mount_template_width: form.mountTemplateWidth,
              mount_template_height: form.mountTemplateHeight,
              collection_character_path: form.collectionCharacterPath,
              collection_display_starts_at: datetimeLocalToIso(
                form.collectionDisplayStartsAt,
              ),
              collection_display_ends_at: datetimeLocalToIso(
                form.collectionDisplayEndsAt,
              ),
              progress_modal_frame_path: form.progressModalFramePath,
              progress_modal_frame_width: form.progressModalFrameWidth,
              progress_modal_frame_height: form.progressModalFrameHeight,
              progress_modal_slots: form.progressModalSlots,
              progress_modal_button: form.progressModalButton,
              progress_modal_center: form.progressModalCenter,
              progress_modal_ring_color: form.progressModalRingColor,
              progress_modal_badge_color: form.progressModalBadgeColor,
              progress_modal_badge_text_color: form.progressModalBadgeTextColor,
              progress_modal_badge_bg_color: form.progressModalBadgeBgColor,
              progress_modal_button_color: form.progressModalButtonColor,
              progress_modal_button_text_color:
                form.progressModalButtonTextColor,
              unlock_announcement_hero_path: form.unlockAnnouncementHeroPath,
              unlock_announcement_initial_body:
                form.unlockAnnouncementInitialBody,
              unlock_announcement_drip_body: form.unlockAnnouncementDripBody,
              unlock_announcement_accent_color:
                form.unlockAnnouncementAccentColor,
              unlock_announcement_accent_hover_color:
                form.unlockAnnouncementAccentHoverColor,
              unlock_announcement_title_color:
                form.unlockAnnouncementTitleColor,
              unlock_announcement_soft_color: form.unlockAnnouncementSoftColor,
              display_order: form.displayOrder,
              is_active: form.isActive,
            }
          : {
              display_name_ja: form.displayNameJa.trim(),
              display_name_en: form.displayNameEn.trim(),
              badge_color: form.badgeColor,
              badge_text_color: form.badgeTextColor,
              skip_base_prefix: form.skipBasePrefix,
              default_image_input_mode: form.defaultImageInputMode,
              output_aspect_ratio_mode: form.outputAspectRatioMode,
              user_guidance_ja: form.userGuidanceJa.trim() || null,
              user_guidance_en: form.userGuidanceEn.trim() || null,
              show_source_image_type_control: form.showSourceImageTypeControl,
              show_background_change_control: form.showBackgroundChangeControl,
              show_generation_model_control: form.showGenerationModelControl,
              show_user_prompt_input: form.showUserPromptInput,
              user_prompt_label: form.userPromptLabel.trim() || null,
              user_prompt_placeholder: form.userPromptPlaceholder.trim() || null,
              user_prompt_max_length: form.userPromptMaxLength,
              visibility: form.visibility,
              is_collection_series: form.isCollectionSeries,
              lottery_target: form.lotteryTarget,
              completion_threshold: effectiveThreshold,
              completion_reward_percoins: form.completionRewardPercoins,
              completion_view_mode: form.completionViewMode,
              book_cover_path: form.bookCoverPath,
              unlock_prerequisite_key: form.unlockPrerequisiteKey,
              progressive_batch_size: form.progressiveBatchSize,
              sequential_unlock: form.sequentialUnlock,
              mount_template_path: form.mountTemplatePath,
              mount_layout: form.mountLayout === "" ? null : form.mountLayout,
              mount_slots: form.mountSlots,
              mount_template_width: form.mountTemplateWidth,
              mount_template_height: form.mountTemplateHeight,
              collection_character_path: form.collectionCharacterPath,
              collection_display_starts_at: datetimeLocalToIso(
                form.collectionDisplayStartsAt,
              ),
              collection_display_ends_at: datetimeLocalToIso(
                form.collectionDisplayEndsAt,
              ),
              progress_modal_frame_path: form.progressModalFramePath,
              progress_modal_frame_width: form.progressModalFrameWidth,
              progress_modal_frame_height: form.progressModalFrameHeight,
              progress_modal_slots: form.progressModalSlots,
              progress_modal_button: form.progressModalButton,
              progress_modal_center: form.progressModalCenter,
              progress_modal_ring_color: form.progressModalRingColor,
              progress_modal_badge_color: form.progressModalBadgeColor,
              progress_modal_badge_text_color: form.progressModalBadgeTextColor,
              progress_modal_badge_bg_color: form.progressModalBadgeBgColor,
              progress_modal_button_color: form.progressModalButtonColor,
              progress_modal_button_text_color:
                form.progressModalButtonTextColor,
              unlock_announcement_hero_path: form.unlockAnnouncementHeroPath,
              unlock_announcement_initial_body:
                form.unlockAnnouncementInitialBody,
              unlock_announcement_drip_body: form.unlockAnnouncementDripBody,
              unlock_announcement_accent_color:
                form.unlockAnnouncementAccentColor,
              unlock_announcement_accent_hover_color:
                form.unlockAnnouncementAccentHoverColor,
              unlock_announcement_title_color:
                form.unlockAnnouncementTitleColor,
              unlock_announcement_soft_color: form.unlockAnnouncementSoftColor,
              display_order: form.displayOrder,
              is_active: form.isActive,
            };

      const url =
        mode === "create"
          ? "/api/admin/preset-categories"
          : `/api/admin/preset-categories/${initial?.id}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(payload.error ?? `Request failed: ${res.status}`);
        return;
      }

      router.push("/admin/preset-categories");
      router.refresh();
    } catch (err) {
      console.error("[AdminPresetCategoryFormClient] submit failed:", err);
      setError("送信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    if (mode !== "edit" || !initial) return;
    if (!confirm(`カテゴリ "${initial.displayNameJa}" を inactive にしますか?\n` +
      "(物理削除ではなく、新規 preset 作成の選択肢から外れるだけです。既存 preset の表示・生成には影響しません。)"))
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/preset-categories/${initial.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(payload.error ?? `Request failed: ${res.status}`);
        return;
      }
      router.push("/admin/preset-categories");
      router.refresh();
    } catch (err) {
      console.error("[AdminPresetCategoryFormClient] deactivate failed:", err);
      setError("送信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-md border border-slate-200 bg-white p-6"
    >
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            key (不変)
          </span>
          <input
            type="text"
            value={form.key}
            onChange={(e) => update("key", e.target.value)}
            readOnly={mode === "edit"}
            disabled={mode === "edit"}
            pattern="^[a-z][a-z0-9_]{1,49}$"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm disabled:bg-slate-100"
            placeholder="chibi"
          />
          <span className="mt-1 block text-xs text-slate-500">
            小文字英数字 + `_`、先頭は英字。2-50 文字。
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            表示順 (昇順)
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={form.displayOrder}
            onChange={(e) =>
              update("displayOrder", Number(e.target.value) || 0)
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            表示名 (日本語)
          </span>
          <input
            type="text"
            value={form.displayNameJa}
            onChange={(e) => update("displayNameJa", e.target.value)}
            required
            maxLength={60}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="ちびキャラ"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            表示名 (English)
          </span>
          <input
            type="text"
            value={form.displayNameEn}
            onChange={(e) => update("displayNameEn", e.target.value)}
            required
            maxLength={60}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Chibi"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            バッジ背景色
          </span>
          <input
            type="color"
            value={form.badgeColor}
            onChange={(e) => update("badgeColor", e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-slate-300"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            バッジ文字色
          </span>
          <input
            type="color"
            value={form.badgeTextColor}
            onChange={(e) => update("badgeTextColor", e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-slate-300"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            デフォルト画像入力モード
          </span>
          <select
            value={form.defaultImageInputMode}
            onChange={(e) =>
              update(
                "defaultImageInputMode",
                e.target.value as "single" | "dual",
              )
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="single">single (image_0 のみ)</option>
            <option value="dual">dual (image_0 + 参考画像)</option>
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            preset 新規作成時の初期値。preset ごとに上書き可能。
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            出力比率
          </span>
          <select
            value={form.outputAspectRatioMode}
            onChange={(e) =>
              update(
                "outputAspectRatioMode",
                e.target.value as StyleOutputAspectRatioMode,
              )
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="source">アップロード画像に合わせる(自動)</option>
            {EXPLICIT_OUTPUT_ASPECT_RATIOS.map((ratio) => {
              const [w, h] = ratio.split(":").map(Number);
              const orientation =
                w === h ? "正方形" : w > h ? "横長" : "縦長";
              return (
                <option key={ratio} value={ratio}>
                  {ratio}（{orientation}）
                </option>
              );
            })}
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            「自動」はアップロード画像の比率に合わせて9段階(9:16〜16:9)の最も近い比率で出力します。比率を明示指定すると、このカテゴリの生成は常にその比率で出力します(Gemini)。OpenAI は 1:1 のみ固定に対応。
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            公開範囲
          </span>
          <select
            value={form.visibility}
            onChange={(e) =>
              update(
                "visibility",
                e.target.value as "public" | "admin_only",
              )
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="admin_only">運営のみ</option>
            <option value="public">全ユーザーに公開</option>
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            運営のみの場合、ADMIN_USER_IDS のユーザーだけ /style に表示・生成できます。
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            ユーザー向け説明 (日本語)
          </span>
          <textarea
            value={form.userGuidanceJa}
            onChange={(e) => update("userGuidanceJa", e.target.value)}
            maxLength={1000}
            rows={5}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="例: 正面向き・全身が写っているイラストがおすすめです。"
          />
          <span className="mt-1 block text-xs text-slate-500">
            ユーザーに推奨画像や注意事項を伝えるための説明文です。表示場所は別 UI で利用できます。
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            ユーザー向け説明 (English)
          </span>
          <textarea
            value={form.userGuidanceEn}
            onChange={(e) => update("userGuidanceEn", e.target.value)}
            maxLength={1000}
            rows={5}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Example: Front-facing full-body illustrations work best."
          />
        </label>
      </div>

      <div className="rounded-md bg-slate-50 p-4">
        <p className="mb-2 text-sm font-medium text-slate-700">プレビュー</p>
        <span
          className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold"
          style={{
            backgroundColor: form.badgeColor,
            color: form.badgeTextColor,
          }}
        >
          {form.displayNameJa || "(表示名)"}
        </span>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-700">挙動フラグ</legend>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.skipBasePrefix}
            onChange={(e) => update("skipBasePrefix", e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">raw モード (skip_base_prefix)</span>
            <br />
            <span className="text-xs text-slate-500">
              true にすると生成時に共通プロンプト (style.base_prefix) を一切付与せず、
              admin が登録した文言だけを送ります。ちびキャラ・デフォルメ・イラスト化など、
              フォルム自体を変える生成に使います。
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => update("isActive", e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">active</span>
            <br />
            <span className="text-xs text-slate-500">
              false にすると新規 preset 作成の選択肢から外れます。
              既存 preset の表示・生成可否は preset 側の status で制御するため、
              inactive にしても過去の preset 表示・集計は維持されます。
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-700">
          ユーザー画面の表示項目
        </legend>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.showSourceImageTypeControl}
            onChange={(e) =>
              update("showSourceImageTypeControl", e.target.checked)
            }
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">アップロード画像のタイプを表示</span>
            <br />
            <span className="text-xs text-slate-500">
              OFF の場合、/style では「イラスト / 写真」を選ばせず、生成時は illustration として扱います。
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.showBackgroundChangeControl}
            onChange={(e) =>
              update("showBackgroundChangeControl", e.target.checked)
            }
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">背景設定を表示</span>
            <br />
            <span className="text-xs text-slate-500">
              OFF の場合、/style では背景変更チェックを表示せず、生成時は背景変更なしとして扱います。
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.showGenerationModelControl}
            onChange={(e) =>
              update("showGenerationModelControl", e.target.checked)
            }
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">生成モデル選択を表示</span>
            <br />
            <span className="text-xs text-slate-500">
              OFF の場合、/style ではモデル選択を表示せず、既定モデル（{DEFAULT_GENERATION_MODEL_LABEL}）で生成します。
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.showUserPromptInput}
            onChange={(e) =>
              update("showUserPromptInput", e.target.checked)
            }
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">ユーザープロンプト入力欄を表示</span>
            <br />
            <span className="text-xs text-slate-500">
              ON にすると /style にプロンプト textarea が出現し、preset.stylingPrompt の後ろにユーザー入力を結合して生成します。OFF (default) なら入力欄は出ず、preset.stylingPrompt のみで生成。
            </span>
          </span>
        </label>

        {form.showUserPromptInput ? (
          <div className="ml-7 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">
              未入力の場合、ユーザー画面では i18n のデフォルト文言「追加スタイルの指示(任意)」「例: 長袖のコートも追加して」が表示されます。
            </p>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                ラベル(textarea の見出し)
              </span>
              <textarea
                value={form.userPromptLabel}
                onChange={(e) => update("userPromptLabel", e.target.value)}
                maxLength={120}
                rows={2}
                placeholder={"例: 名前を記載してください(任意)\n【神の名前＋名前】になります"}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-slate-500">
                最大 120 文字。改行を入れるとユーザー画面でもそのまま改行表示されます(本文と説明文を分けたいときに利用)。
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                プレースホルダ(textarea 内のヒント)
              </span>
              <textarea
                value={form.userPromptPlaceholder}
                onChange={(e) =>
                  update("userPromptPlaceholder", e.target.value)
                }
                maxLength={200}
                rows={2}
                placeholder="例: ウエハースシールに描いて欲しい一言を入力(例: ハイビスカスの花を持たせて)"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-slate-500">
                最大 200 文字
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                入力できる最大文字数（任意）
              </span>
              <input
                type="number"
                min={1}
                max={1500}
                step={1}
                value={form.userPromptMaxLength ?? ""}
                onChange={(e) =>
                  update(
                    "userPromptMaxLength",
                    e.target.value === ""
                      ? null
                      : Math.floor(Number(e.target.value)),
                  )
                }
                placeholder="例: 10"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-slate-500">
                1〜1500。未設定なら既定の 1500 文字。名前入力用途なら 10
                文字などに絞れます。
              </span>
            </label>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-4 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-800">
          コレクション設定（集めてコンプリート）
        </legend>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.isCollectionSeries}
            onChange={(e) => update("isCollectionSeries", e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">このカテゴリをコレクションシリーズにする</span>
            <br />
            <span className="text-xs text-slate-500">
              ON にすると、ユニーク衣装を N 種そろえるとコンプリート判定・完走表示が走ります。
              mount(台紙)では下記 N / レイアウト / 台紙テンプレが必須、book(日記帳)では N と表紙のみで動きます。
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.lotteryTarget}
            onChange={(e) => update("lotteryTarget", e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">Xシェア抽選プレゼントの対象にする</span>
            <br />
            <span className="text-xs text-slate-500">
              ON にすると、このカテゴリの完走台紙(所有者)に「Xで応募する」ボタンを表示します。
              受付期間は下の「企画表示期間」を流用します(未設定なら常時)。賞品・ハッシュタグ・
              規約はコード側の現行キャンペーン設定を使います。OFF なら一切表示されません。
            </span>
          </span>
        </label>

        {/* 完走表示モード: 単一台紙 or めくれる日記帳(スクラップブック) */}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">完走表示モード</span>
          <select
            value={form.completionViewMode}
            onChange={(e) =>
              update(
                "completionViewMode",
                e.target.value === "book" ? "book" : "mount",
              )
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
          >
            <option value="mount">mount（単一コンプリートカード/台紙）</option>
            <option value="book">book（めくれる日記帳・スクラップブック）</option>
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            book は 9:16 縦長×N枚を1枚ずつめくれる本として表示・シェアします（travel_to_italy 等)。
          </span>
        </label>

        {form.completionViewMode === "book" ? (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              本の表紙(0ページ目)画像パス(任意・共通固定表紙)
            </span>
            <input
              type="text"
              value={form.bookCoverPath ?? ""}
              onChange={(e) =>
                update("bookCoverPath", e.target.value.trim() || null)
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="全員共通の固定表紙にする場合のみ generated-images の storage path"
            />
            <span className="mt-1 block text-xs text-slate-500">
              既定は「コレクション先頭(sort_order 最小)プリセットのユーザー生成画像」が表紙になります(完走数 N は表紙プリセットを含めて数える)。ここにパスを入れた場合のみ全員共通の固定表紙に上書き。9:16 を想定。
            </span>
          </label>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              コンプリート必要数 N
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={form.completionThreshold ?? ""}
              onChange={(e) => handleThresholdChange(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="4"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              完走報酬（ペルコイン）
            </span>
            <input
              type="number"
              min={0}
              step={1}
              value={form.completionRewardPercoins ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  update("completionRewardPercoins", null);
                  return;
                }
                const n = Number(raw);
                update(
                  "completionRewardPercoins",
                  Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null,
                );
              }}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="100"
            />
            <span className="mt-1 block text-xs text-slate-500">
              コレクション完走時に付与するペルコイン数。0または空欄で報酬なし。
            </span>
          </label>

          {form.completionViewMode !== "book" ? (
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                台紙レイアウト
              </span>
              <select
                value={form.mountLayout}
                onChange={(e) =>
                  handleLayoutChange(e.target.value as FormState["mountLayout"])
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">（未選択）</option>
                <option value="grid_3">grid_3（3枠）</option>
                <option value="grid_4">grid_4（4枠・2×2）</option>
                <option value="grid_6">grid_6（6枠・2×3）</option>
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                レイアウトを変えると枠が作り直されます（調整済みなら確認します）。N を変えると枠数も増減します。
              </span>
            </label>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              進捗カードの表示開始日時（任意）
            </span>
            <input
              type="datetime-local"
              value={form.collectionDisplayStartsAt}
              onChange={(e) =>
                update("collectionDisplayStartsAt", e.target.value)
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">
              未設定なら即時表示。
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              進捗カードの表示終了日時（任意）
            </span>
            <input
              type="datetime-local"
              value={form.collectionDisplayEndsAt}
              onChange={(e) =>
                update("collectionDisplayEndsAt", e.target.value)
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">
              終了後はマイページの進捗カード・進捗モーダルが非表示になります（admin
              にも適用）。完了サムネ・シェア・達成済みユーザーの台紙更新、/style
              での生成は終了後も可能です。
            </span>
          </label>
        </div>

        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-800">解放ゲート</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                解放の前提カテゴリ
              </span>
              <select
                value={form.unlockPrerequisiteKey ?? ""}
                onChange={(e) =>
                  update("unlockPrerequisiteKey", e.target.value || null)
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">なし（ゲートなし）</option>
                {prerequisiteOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.displayNameJa}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                このカテゴリを完走したユーザーにのみ表示します（完走者限定）。
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                段階解放の単位
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={form.progressiveBatchSize ?? ""}
                onChange={(e) => {
                  // 入力中に値を消さないため、任意の整数を state に許容する。
                  // 不正値(0/負)は min={1}(ネイティブ)+ 保存時のバリデーションで弾く。
                  if (e.target.value === "") {
                    update("progressiveBatchSize", null);
                    return;
                  }
                  const n = Number.parseInt(e.target.value, 10);
                  update(
                    "progressiveBatchSize",
                    Number.isNaN(n) ? null : n,
                  );
                }}
                placeholder="空=一括解放"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-slate-500">
                カテゴリ内のプリセットを何体ずつ解放するか（空=最初から全部）。
              </span>
            </label>
          </div>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.sequentialUnlock}
              onChange={(e) => update("sequentialUnlock", e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">
              <span className="font-medium">順番固定で順次解放する（sequential unlock）</span>
              <br />
              <span className="text-xs text-slate-500">
                ON にすると、前提カテゴリが無くても <strong>sort_order 先頭（最小）＝表紙</strong> から昇順に解放します（前を生成すると次が解放）。解放単位は上の「段階解放の単位」に従い、<strong>空のときは1つずつ</strong>。旅行日記など「表紙→Day1→…」の順序固定に使います。OFF の既存挙動（前提カテゴリ付きは末尾から）には影響しません。
              </span>
            </span>
          </label>
        </div>

        {/* 解放お知らせモーダル(PetitUnlockAnnouncer)のカスタム設定。
            すべて任意・独立。未設定なら現行ハードコード(画像/文言/紫基調の配色)に
            フォールバックする(= 厳密な no-op)。解放ゲート付きカテゴリでのみ実際に表示される。 */}
        <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              解放お知らせ設定（任意）
            </p>
            <p className="mt-1 text-xs text-slate-500">
              解放ゲートを完走したユーザーがホームで見る「解放されました！」モーダルの
              ヒーロー画像・本文・配色をカテゴリごとに設定します。未設定の項目は標準の紫基調にフォールバックします。
            </p>
          </div>

          {/* ヒーロー画像(初回モーダル) */}
          <div className="block">
            <span className="text-sm font-medium text-slate-700">
              ヒーロー画像（初回モーダル・任意）
            </span>
            <input
              type="file"
              accept="image/png,image/webp,image/jpeg"
              disabled={uploadingUnlockHero}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUnlockHeroUpload(file);
                e.target.value = "";
              }}
              className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-300 disabled:opacity-50"
            />
            <span className="mt-1 block text-xs text-slate-500">
              {uploadingUnlockHero
                ? "アップロード中..."
                : form.unlockAnnouncementHeroPath
                  ? `登録済み: ${form.unlockAnnouncementHeroPath}`
                  : "PNG/WebP/JPEG。推奨は正方形(例 600×600)。未設定なら標準のヒーロー画像を表示。"}
            </span>
            {form.unlockAnnouncementHeroPath && !uploadingUnlockHero ? (
              <div className="mt-2 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={characterPublicUrl(form.unlockAnnouncementHeroPath)}
                  alt="登録済みのヒーロー画像のプレビュー"
                  className="h-24 w-24 rounded-lg object-cover ring-1 ring-slate-200"
                />
                <button
                  type="button"
                  onClick={() => update("unlockAnnouncementHeroPath", null)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  クリア（標準画像に戻す）
                </button>
              </div>
            ) : null}
          </div>

          {/* 本文(初回 / 段階) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                初回モーダルの本文
              </span>
              <textarea
                value={form.unlockAnnouncementInitialBody ?? ""}
                maxLength={200}
                rows={3}
                onChange={(e) =>
                  update(
                    "unlockAnnouncementInitialBody",
                    e.target.value.length > 0 ? e.target.value : null,
                  )
                }
                placeholder="空=標準文（コンプリート報酬の新しいスタイルが登場…）"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-slate-500">
                最大200文字。空欄なら標準文を表示。
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                段階解放モーダルの本文
              </span>
              <textarea
                value={form.unlockAnnouncementDripBody ?? ""}
                maxLength={200}
                rows={3}
                onChange={(e) =>
                  update(
                    "unlockAnnouncementDripBody",
                    e.target.value.length > 0 ? e.target.value : null,
                  )
                }
                placeholder="空=標準文（○○の続きが登場しました。）"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-slate-500">
                最大200文字。空欄なら標準文を表示。
              </span>
            </label>
          </div>

          {/* 配色(4色)。null なら標準の紫基調にフォールバック。 */}
          <div className="space-y-4">
            <ColorField
              label="ボタン/アクセント色"
              value={form.unlockAnnouncementAccentColor}
              defaultSwatch="#C670FF"
              onChange={(v) => update("unlockAnnouncementAccentColor", v)}
            />
            <ColorField
              label="ボタン hover 色"
              value={form.unlockAnnouncementAccentHoverColor}
              defaultSwatch="#B14DF0"
              onChange={(v) => update("unlockAnnouncementAccentHoverColor", v)}
            />
            <ColorField
              label="見出しの文字色"
              value={form.unlockAnnouncementTitleColor}
              defaultSwatch="#8B3DC9"
              onChange={(v) => update("unlockAnnouncementTitleColor", v)}
            />
            <ColorField
              label="NEW ピル/淡い面の背景色"
              value={form.unlockAnnouncementSoftColor}
              defaultSwatch="#F3E0FF"
              onChange={(v) => update("unlockAnnouncementSoftColor", v)}
            />
          </div>
        </div>

        <div className="block">
          <span className="text-sm font-medium text-slate-700">
            台紙テンプレ（キャラを抜いた空PNG）
          </span>
          <input
            type="file"
            accept="image/png"
            disabled={uploadingTemplate}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleTemplateUpload(file);
              e.target.value = "";
            }}
            className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-sm"
          />
          <span className="mt-1 block text-xs text-slate-500">
            {uploadingTemplate
              ? "アップロード中…"
              : form.mountTemplatePath
                ? `登録済み: ${form.mountTemplatePath}`
                : "PNG・256〜4096px。アップロードすると保存パスが設定されます。"}
          </span>
          {form.mountTemplatePath && !uploadingTemplate ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={mountTemplatePreviewUrl(form.mountTemplatePath)}
              alt="登録済みの台紙テンプレのプレビュー"
              className="mt-2 max-h-56 w-auto rounded-md border border-slate-200 bg-slate-50"
            />
          ) : null}
        </div>

        {/* 枠(スロット)の調整。台紙テンプレと実寸が揃っているときだけ操作可能。 */}
        <div className="block">
          <span className="text-sm font-medium text-slate-700">
            枠（スロット）の調整
          </span>
          {!form.mountTemplatePath ? (
            <p className="mt-1 text-xs text-slate-500">
              台紙テンプレをアップロードすると、枠をドラッグで調整できます。未調整なら台紙レイアウト（grid_3/4/6）のプリセット枠が使われます。
            </p>
          ) : form.mountTemplateWidth === null ||
            form.mountTemplateHeight === null ? (
            <p className="mt-1 text-xs text-amber-600">
              この台紙には実寸情報がありません。台紙テンプレをもう一度アップロードすると枠調整が有効になります（既存の台紙は再アップロード不要・プリセット枠で動作します）。
            </p>
          ) : form.mountSlots && form.mountSlots.length > 0 ? (
            <div className="mt-2 space-y-2">
              <MountSlotEditor
                templateUrl={mountTemplatePreviewUrl(form.mountTemplatePath)}
                templateWidth={form.mountTemplateWidth}
                templateHeight={form.mountTemplateHeight}
                slots={form.mountSlots}
                onChange={(slots) => update("mountSlots", slots)}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSeedSlots}
                  disabled={!isMountLayoutKey(form.mountLayout)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  選択中レイアウトから枠を再生成
                </button>
                <button
                  type="button"
                  onClick={handleClearSlots}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  カスタム枠を破棄（プリセットに戻す）
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-slate-500">
                台紙レイアウト（grid_3/4/6）を選んで「枠を初期化」すると、その配置を元に枠をドラッグ調整できます。
              </p>
              <button
                type="button"
                onClick={handleSeedSlots}
                disabled={!isMountLayoutKey(form.mountLayout)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                選択中レイアウトから枠を初期化
              </button>
            </div>
          )}
        </div>

        <div className="block">
          <span className="text-sm font-medium text-slate-700">
            進捗リング中央キャラ画像（名前なし・任意）
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploadingCharacter}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleCharacterUpload(file);
              e.target.value = "";
            }}
            className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-sm"
          />
          <span className="mt-1 block text-xs text-slate-500">
            {uploadingCharacter
              ? "アップロード中…"
              : form.collectionCharacterPath
                ? `登録済み: ${form.collectionCharacterPath}`
                : "PNG/JPEG/WebP。進捗リング中央に表示するキャラ画像。未設定なら「N/M種」のテキスト表示。"}
          </span>
          {form.collectionCharacterPath && !uploadingCharacter ? (
            /* 実際の表示と同じ円形トリミングでプレビューする */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={characterPublicUrl(form.collectionCharacterPath)}
              alt="登録済みの進捗リング中央キャラ画像のプレビュー"
              className="mt-2 h-24 w-24 rounded-full border border-slate-200 object-cover"
            />
          ) : null}
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-800">
          進捗モーダル設定（任意）
        </legend>
        <p className="text-xs text-slate-500">
          進捗モーダル(コンプリート前の祝い画面)の土台フレーム・シール枠・ボタン位置をカテゴリごとに設定します。
          未設定のカテゴリは従来のハードコード台座（神コレ/ウエハース等）で表示されます。
          コレクション設定（上）とは独立です。
        </p>

        <div className="block">
          <span className="text-sm font-medium text-slate-700">
            モーダル土台フレーム（PNG / WebP）
          </span>
          <input
            type="file"
            accept="image/png,image/webp"
            disabled={uploadingModalFrame}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleModalFrameUpload(file);
              e.target.value = "";
            }}
            className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-sm"
          />
          <span className="mt-1 block text-xs text-slate-500">
            {uploadingModalFrame
              ? "アップロード中…"
              : form.progressModalFramePath
                ? `登録済み: ${form.progressModalFramePath}`
                : "PNG/WebP・256〜4096px。アップロードすると保存パスと実寸が設定されます。"}
          </span>
          {form.progressModalFramePath && !uploadingModalFrame ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={characterPublicUrl(form.progressModalFramePath)}
              alt="登録済みのモーダル土台フレームのプレビュー"
              className="mt-2 max-h-56 w-auto rounded-md border border-slate-200 bg-slate-50"
            />
          ) : null}
        </div>

        {/* シール枠の調整(枠数=コンプリート必要数 N に連動)。フレームと実寸が揃っているときだけ操作可能。 */}
        <div className="block">
          <span className="text-sm font-medium text-slate-700">
            シール枠（
            {form.completionThreshold && form.completionThreshold > 0
              ? `${form.completionThreshold}枠`
              : "N枠"}
            ）の調整
          </span>
          {!form.progressModalFramePath ||
          form.progressModalFrameWidth === null ||
          form.progressModalFrameHeight === null ? (
            <p className="mt-1 text-xs text-slate-500">
              モーダル土台フレームをアップロードすると、シール枠をドラッグで調整できます。
            </p>
          ) : form.progressModalSlots && form.progressModalSlots.length > 0 ? (
            <div className="mt-2 space-y-2">
              <MountSlotEditor
                templateUrl={characterPublicUrl(form.progressModalFramePath)}
                templateWidth={form.progressModalFrameWidth}
                templateHeight={form.progressModalFrameHeight}
                slots={form.progressModalSlots}
                onChange={(slots) => update("progressModalSlots", slots)}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSeedModalSlots}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  N枠で再生成（grid_6 基準）
                </button>
                <button
                  type="button"
                  onClick={handleClearModalSlots}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  シール枠を破棄
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-slate-500">
                「N枠を初期化」すると、コンプリート必要数 N に合わせた枠数(grid_6
                基準・N&gt;6 は余剰をデフォルト位置に追加)を元にドラッグ調整できます。
              </p>
              <button
                type="button"
                onClick={handleSeedModalSlots}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                N枠を初期化
              </button>
            </div>
          )}
        </div>

        {/* ボタン領域(1枠)の調整。フレームと実寸が揃っているときだけ操作可能。 */}
        <div className="block">
          <span className="text-sm font-medium text-slate-700">
            ボタン領域（「台紙を作成する」）の調整
          </span>
          {!form.progressModalFramePath ||
          form.progressModalFrameWidth === null ||
          form.progressModalFrameHeight === null ? (
            <p className="mt-1 text-xs text-slate-500">
              モーダル土台フレームをアップロードすると、ボタン領域をドラッグで調整できます。
            </p>
          ) : form.progressModalButton ? (
            <div className="mt-2 space-y-2">
              <MountSlotEditor
                templateUrl={characterPublicUrl(form.progressModalFramePath)}
                templateWidth={form.progressModalFrameWidth}
                templateHeight={form.progressModalFrameHeight}
                slots={[form.progressModalButton]}
                onChange={(slots) =>
                  update("progressModalButton", slots[0] ?? null)
                }
              />
              <button
                type="button"
                onClick={handleClearModalButton}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                ボタン領域を破棄
              </button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-slate-500">
                「ボタン領域を初期化」すると下部にボタン枠が置かれ、ドラッグ調整できます。
              </p>
              <button
                type="button"
                onClick={handleSeedModalButton}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                ボタン領域を初期化
              </button>
            </div>
          )}
        </div>

        {/* 中央画像領域(1枠)の調整。フレームと実寸が揃っているときだけ操作可能。
            ここに表示される画像は中央キャラ画像(collection_character_path)を流用する。 */}
        <div className="block">
          <span className="text-sm font-medium text-slate-700">
            中央画像の位置
          </span>
          {!form.progressModalFramePath ||
          form.progressModalFrameWidth === null ||
          form.progressModalFrameHeight === null ? (
            <p className="mt-1 text-xs text-slate-500">
              モーダル土台フレームをアップロードすると、中央画像の位置をドラッグで調整できます。
            </p>
          ) : form.progressModalCenter ? (
            <div className="mt-2 space-y-2">
              <MountSlotEditor
                templateUrl={characterPublicUrl(form.progressModalFramePath)}
                templateWidth={form.progressModalFrameWidth}
                templateHeight={form.progressModalFrameHeight}
                slots={[form.progressModalCenter]}
                onChange={(slots) =>
                  update("progressModalCenter", slots[0] ?? null)
                }
              />
              <p className="text-xs text-slate-500">
                ※ ここに表示される画像は「中央キャラ画像（collection_character_path）」を流用します。位置だけをここで調整します。
              </p>
              <button
                type="button"
                onClick={handleClearModalCenter}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                中央画像の位置を破棄
              </button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-slate-500">
                「中央画像の位置を初期化」すると中央付近に枠が置かれ、ドラッグ調整できます。表示される画像は中央キャラ画像（collection_character_path）を流用します。
              </p>
              <button
                type="button"
                onClick={handleSeedModalCenter}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                中央画像の位置を初期化
              </button>
            </div>
          )}
        </div>

        {/* 進捗リング/%達成バッジの配色。null(未設定)なら従来デフォルト配色
            (オレンジのリング/ゴールドのバッジ)を使う(= 厳密な no-op)。
            左に各色のカラー入力、右にライブプレビュー(リング + %達成バッジ)を並べる。 */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex-1 space-y-4">
        <ColorField
          label="進捗リングの色"
          value={form.progressModalRingColor}
          defaultSwatch="#F97316"
          onChange={(v) => update("progressModalRingColor", v)}
        />
        <ColorField
          label="%達成バッジの色"
          value={form.progressModalBadgeColor}
          defaultSwatch="#F59E0B"
          onChange={(v) => update("progressModalBadgeColor", v)}
        />
        <ColorField
          label="バッジの文字色"
          value={form.progressModalBadgeTextColor}
          defaultSwatch="#F97316"
          onChange={(v) => update("progressModalBadgeTextColor", v)}
        />
        <ColorField
          label="バッジの背景色"
          value={form.progressModalBadgeBgColor}
          defaultSwatch="#FEF3C7"
          onChange={(v) => update("progressModalBadgeBgColor", v)}
        />
        <ColorField
          label="CTAボタンの塗り色"
          value={form.progressModalButtonColor}
          defaultSwatch="#F97316"
          onChange={(v) => update("progressModalButtonColor", v)}
        />
        <ColorField
          label="CTAボタンの文字色"
          value={form.progressModalButtonTextColor}
          defaultSwatch="#FFFFFF"
          onChange={(v) => update("progressModalButtonTextColor", v)}
        />
        </div>

        {/* ライブプレビュー: 上で選んだ色がリング/バッジにどう反映されるか確認できる。 */}
        <div className="shrink-0">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            プレビュー
          </span>
          <ProgressModalColorPreview
            ringColor={form.progressModalRingColor}
            badgeColor={form.progressModalBadgeColor}
            badgeTextColor={form.progressModalBadgeTextColor}
            badgeBgColor={form.progressModalBadgeBgColor}
            buttonColor={form.progressModalButtonColor}
            buttonTextColor={form.progressModalButtonTextColor}
          />
        </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4">
        {mode === "edit" && initial?.isActive && (
          <button
            type="button"
            onClick={handleDeactivate}
            disabled={busy}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            inactive にする
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push("/admin/preset-categories")}
          disabled={busy}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {mode === "create" ? "作成する" : "更新する"}
        </button>
      </div>
    </form>
  );
}
