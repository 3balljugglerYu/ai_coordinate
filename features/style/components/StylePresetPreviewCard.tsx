"use client";

import type { Ref } from "react";
import Image from "next/image";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StyleProviderCredit } from "@/features/style/components/StyleProviderCredit";
import { resolveStylePresetProvider } from "@/features/style-presets/lib/schema";

const PRESET_NAME_MAX_CHARACTERS = 16;
const STYLE_PRESET_CARD_WIDTH_PX = 180;
const STYLE_PRESET_CARD_IMAGE_HEIGHT_PX = 240;
const STYLE_PRESET_CARD_TITLE_HEIGHT_PX = 44;
const STYLE_PRESET_CARD_HEIGHT_PX =
  STYLE_PRESET_CARD_IMAGE_HEIGHT_PX + STYLE_PRESET_CARD_TITLE_HEIGHT_PX;

interface StylePresetPreviewCardCategory {
  key: string;
  displayNameJa: string;
  displayNameEn: string;
  badgeColor: string;
  badgeTextColor: string;
  /** 提供者クレジット(設定時のみカテゴリラベルの上に「提供 <nickname>」を表示)。 */
  providerUserId?: string | null;
  providerNickname?: string | null;
  providerAvatarUrl?: string | null;
}

interface StylePresetPreviewCardData {
  id: string;
  title: string;
  thumbnailImageUrl: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
  hasBackgroundPrompt: boolean;
  /**
   * プリセット単位の提供者クレジット(設定時はカテゴリ単位より優先)。
   * resolveStylePresetProvider がこれらを読むため、型契約として明示する。
   */
  providerUserId?: string | null;
  providerNickname?: string | null;
  providerAvatarUrl?: string | null;
  /**
   * 紐づく preset_categories のサマリ。`coordinate` (= default) はバッジ非表示で
   * 既存挙動と同じ見た目を保つ。それ以外のカテゴリのみバッジをサムネ画像の
   * 左下に表示する(キャラの顔まわりをバッジで覆わないための配置)。
   */
  category?: StylePresetPreviewCardCategory;
}

interface StylePresetPreviewCardProps {
  preset: StylePresetPreviewCardData;
  alt: string;
  disabled?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  /**
   * バッジ表示時の locale ('ja' / 'en')。display_name_{ja,en} を選ぶ。
   * 省略時は 'ja'。
   */
  locale?: "ja" | "en";
  /**
   * 未ログインでは生成できないカテゴリのとき表示するロックラベル。
   * 指定すると画像を半透明オーバーレイで覆い、中央にこのラベルを出す
   * (例: 「ログインで生成可能！」)。選択操作自体は引き続き可能。
   */
  lockedLabel?: string;
  /**
   * 段階解放(drip)でまだ解放されていないプリセットのとき true。
   * サムネをシルエット(暗転 + ぼかし)にし、🔒 とラベルを重ね、選択・生成不可
   * (button を描画せず非クリックにする)。`dripLockedLabel` で文言を渡す。
   */
  dripLocked?: boolean;
  /** dripLocked=true のとき中央に表示する文言(例: 「あとで とうじょう」)。 */
  dripLockedLabel?: string;
  /**
   * このプリセットを既に生成済みのとき true。企画(コレクション)カードで
   * 「生成した / まだ」を見分けるため、右上に緑の ✓ バッジを表示する。
   */
  generated?: boolean;
  /** generated=true のバッジの読み上げ文言(例: 「生成済み」)。 */
  generatedLabel?: string;
  /**
   * 新着(登録から日が浅い)プリセットのとき左上に表示するバッジ文言(例: 「NEW」)。
   * 探索シートは左上にしおりを重ねるため、渡すのはホームカルーセル等の
   * しおりが無い面に限ること。
   */
  newBadgeLabel?: string;
  /**
   * 探索シートのグリッド用: 固定 180px でなく親セル幅いっぱいに広げる。
   * 画像は 3:4 のアスペクト比を維持する(ストリップの 180x240 と同比率)。
   */
  fluid?: boolean;
}

export function buildStylePresetImageSrc(
  preset: Pick<StylePresetPreviewCardData, "thumbnailImageUrl">
): string {
  return preset.thumbnailImageUrl;
}

export function truncateStylePresetName(name: string): string {
  const characters = Array.from(name);
  if (characters.length <= PRESET_NAME_MAX_CHARACTERS) {
    return name;
  }
  return `${characters.slice(0, PRESET_NAME_MAX_CHARACTERS).join("")}...`;
}

export function StylePresetPreviewCard({
  preset,
  alt,
  disabled = false,
  isSelected,
  onClick,
  buttonRef,
  locale = "ja",
  lockedLabel,
  dripLocked = false,
  dripLockedLabel,
  generated = false,
  generatedLabel,
  newBadgeLabel,
  fluid = false,
}: StylePresetPreviewCardProps) {
  const selected = isSelected === true;
  const isLocked = typeof lockedLabel === "string" && lockedLabel.length > 0;
  // 提供者クレジットはプリセット単位を優先し、無ければカテゴリ単位にフォールバック。
  const provider = resolveStylePresetProvider(preset);
  // 'coordinate' は default カテゴリで既存挙動と同じ見た目を保つため、バッジを描画しない。
  const shouldShowBadge =
    preset.category != null && preset.category.key !== "coordinate";
  const badgeText =
    locale === "en"
      ? preset.category?.displayNameEn
      : preset.category?.displayNameJa;
  const card = (
    <Card
      className={`group overflow-hidden p-0 transition ${
        selected ? "border-2 border-primary" : "hover:ring-2 hover:ring-primary/50"
      }`}
      style={
        fluid
          ? { width: "100%" }
          : {
              width: STYLE_PRESET_CARD_WIDTH_PX,
              height: STYLE_PRESET_CARD_HEIGHT_PX,
            }
      }
    >
      <div className="flex h-full flex-col overflow-hidden bg-gray-100">
        <div
          className="relative w-full overflow-hidden bg-gray-100"
          style={
            fluid
              ? {
                  aspectRatio: `${STYLE_PRESET_CARD_WIDTH_PX} / ${STYLE_PRESET_CARD_IMAGE_HEIGHT_PX}`,
                }
              : { height: STYLE_PRESET_CARD_IMAGE_HEIGHT_PX }
          }
        >
          <Image
            src={buildStylePresetImageSrc(preset)}
            alt={alt}
            fill
            sizes={
              fluid
                ? "(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                : `${STYLE_PRESET_CARD_WIDTH_PX}px`
            }
            className="object-cover object-top"
            style={
              dripLocked
                ? { filter: "grayscale(1) brightness(0.18) blur(2px)" }
                : undefined
            }
            priority={selected && !dripLocked}
          />
          {dripLocked && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-slate-900/55 px-2 text-center">
              <Lock className="h-6 w-6 text-white/90" aria-hidden="true" />
              {typeof dripLockedLabel === "string" &&
                dripLockedLabel.length > 0 && (
                  <span className="text-[11px] font-bold leading-tight text-white drop-shadow">
                    {dripLockedLabel}
                  </span>
                )}
            </div>
          )}
          {!dripLocked && shouldShowBadge && preset.category && (
            <span
              className="absolute bottom-1.5 left-1.5 inline-flex max-w-[80%] items-center truncate rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight shadow-sm"
              style={{
                backgroundColor: preset.category.badgeColor,
                color: preset.category.badgeTextColor,
              }}
              aria-label={badgeText}
            >
              {badgeText}
            </span>
          )}
          {!dripLocked && isLocked && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/65 px-2 backdrop-blur-[1px]">
              <span className="inline-flex items-center rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-3 py-1 text-center text-[11px] font-bold leading-tight text-white shadow-md">
                {lockedLabel}
              </span>
            </div>
          )}
          {/* 新着バッジ(左上)。ブランドのグラデーションで目を引かせる。 */}
          {!dripLocked && newBadgeLabel && (
            <span className="absolute left-1.5 top-1.5 z-20 inline-flex items-center rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-2 py-0.5 text-[10px] font-bold leading-tight text-white shadow">
              {newBadgeLabel}
            </span>
          )}
          {/* 生成済みの企画カードは右上に緑の ✓ バッジ(ホームの企画棚と同じ意匠)。 */}
          {!dripLocked && generated && (
            <span
              className="absolute right-1.5 top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white shadow"
              aria-label={generatedLabel ?? "generated"}
            >
              ✓
            </span>
          )}
        </div>
        <div
          className="flex items-center gap-1.5 border-t bg-white px-3"
          style={{ height: STYLE_PRESET_CARD_TITLE_HEIGHT_PX }}
        >
          {provider && (
            <StyleProviderCredit
              nickname={provider.nickname}
              avatarUrl={provider.avatarUrl}
              locale={locale}
              iconOnly
              className="flex shrink-0 items-center"
            />
          )}
          <p
            className="truncate text-sm font-medium text-slate-900"
            title={preset.title}
          >
            {truncateStylePresetName(preset.title)}
          </p>
        </div>
      </div>
    </Card>
  );

  // dripLocked は選択・生成不可。button を描画せず非クリックなカードとして並べる。
  if (!onClick || dripLocked) {
    return (
      <div
        className={fluid ? "w-full" : "w-fit flex-shrink-0"}
        aria-disabled={dripLocked ? true : undefined}
      >
        {card}
      </div>
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={`text-left disabled:cursor-not-allowed disabled:opacity-60 ${
        fluid ? "w-full" : "flex-shrink-0"
      }`}
      aria-pressed={typeof isSelected === "boolean" ? selected : undefined}
      disabled={disabled}
    >
      {card}
    </button>
  );
}
