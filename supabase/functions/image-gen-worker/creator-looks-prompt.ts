// ===============================================
// Creator Looks: hidden_prompt → 最終生成プロンプトの合成 (pure helper)
// ===============================================
// 設計判断: docs/planning/creator-looks-implementation-plan.md REQ-008, REQ-018
//
// hidden_prompt は VLM (gpt-5.5) が画像から抽出した outfit + background 構造化文字列。
// 「Styling Direction: Head: ... Background: ... Constraints: ...」の形式。
//
// 消費者が「背景もクリエイターの世界に変更」チェックを OFF にした場合 (overrideBackground=false):
//   - Background セクションを取り除く
//   - 末尾に「keep original background」指示を追加 (= 元画像の背景を維持する instruction)
//
// 消費者がチェック ON のとき (overrideBackground=true):
//   - hidden_prompt をそのまま使用 (= Background セクション込み)
//
// Worker 本体から呼ばれる。Deno 環境だが pure なので Jest からもテスト可能。

const BACKGROUND_HEADER = "Background:";
const KEEP_BACKGROUND_DIRECTIVE = "Background: keep the original background of `image_0.png` unchanged.";

/**
 * hidden_prompt から最終的に画像生成 API に渡すプロンプト文字列を組み立てる。
 *
 * @param hiddenPrompt VLM 抽出済みの構造化プロンプト
 * @param overrideBackground true なら Background セクション含む、false なら除去 + keep 指示
 * @param cameraDirective 生成プロンプト管理(creator_looks.camera_directive)で編集可能な、
 *   image_1 を「衣装専用参照」に限定しカメラ/構図を image_0 に固定する最優先ルール。
 *   空文字なら付与しない(フォールバック)。背景 ON/OFF どちらでも冒頭に前置する。
 */
export function composeCreatorLooksPrompt(
  hiddenPrompt: string,
  overrideBackground: boolean,
  cameraDirective = "",
): string {
  const body = overrideBackground
    ? hiddenPrompt
    : // Background セクションを除去 + 「元背景を維持」指示を末尾に追加
      // (= 既存 Inspire の override_background=false 相当を gpt-image-2 に伝える)
      `${stripBackgroundSection(hiddenPrompt)}\n\n${KEEP_BACKGROUND_DIRECTIVE}`;

  // カメラ/構図固定の最優先ルールを冒頭に前置する(実機テストで冒頭配置が最も効いた)。
  const head = cameraDirective.trim();
  return head ? `${head}\n\n${body}` : body;
}

/**
 * テキスト中の Background セクションを除去する。
 *
 * meta-prompt 出力形式:
 *   ...
 *   Styling Direction:
 *   Head: ...
 *   Upper Body: ...
 *
 *   Background: <description>
 *
 *   Constraints:
 *   ...
 *
 * "Background:" 行から始まり、次の空行 or 次の見出し ("Constraints:" 等) までを削除する。
 * 見出しは "<Word>:" 形式と仮定。
 *
 * 注意: meta-prompt 出力が想定外の形をしていた場合は no-op に近い動作 (= 安全側)。
 */
export function stripBackgroundSection(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const trimmed = line.trimStart();

    if (!skipping && trimmed.startsWith(BACKGROUND_HEADER)) {
      // この行から skip 開始
      skipping = true;
      continue;
    }

    if (skipping) {
      // 空行 or 次の見出し ("<Word>:") に到達したら skip 終了
      if (trimmed === "" || isSectionHeader(trimmed)) {
        skipping = false;
        // 終了 line は残す (= 次の section の見出し)
        if (trimmed !== "" && isSectionHeader(trimmed)) {
          result.push(line);
        }
        continue;
      }
      // skip 中
      continue;
    }

    result.push(line);
  }

  // 末尾の空行を整理 (= 連続改行を最大 1 行にまとめる)
  return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const SECTION_HEADER_RE = /^[A-Z][A-Za-z0-9 _\-/]*:\s*$/;

function isSectionHeader(trimmedLine: string): boolean {
  // "Styling Direction:" "Constraints:" "Head:" などを section header として認識
  // Background は呼出側で先に判定済みなのでここでは戻ってこない
  return SECTION_HEADER_RE.test(trimmedLine);
}

/**
 * hidden_prompt から Background セクションの「説明本文」を取り出す(stripBackgroundSection の逆)。
 * "Background:" 行から次の空行 or 次の見出しまでを連結して返す。見つからなければ空文字。
 * 背景のみ生成 / 2段階の段階2(背景変更)で、背景の世界観テキストとして使う。
 */
export function extractBackgroundSection(text: string): string {
  const lines = text.split("\n");
  const collected: string[] = [];
  let capturing = false;

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (!capturing && trimmed.startsWith(BACKGROUND_HEADER)) {
      capturing = true;
      // "Background:" の後ろに同一行で説明が続くケースを拾う
      const inline = trimmed.slice(BACKGROUND_HEADER.length).trim();
      if (inline) collected.push(inline);
      continue;
    }
    if (capturing) {
      if (trimmed === "" || isSectionHeader(trimmed)) break;
      collected.push(trimmed);
    }
  }
  return collected.join(" ").trim();
}

/**
 * 「背景だけ」を変える段階のプロンプトを組み立てる(image_1 は渡さない前提)。
 *
 * - 背景のみモード: 元のキャラ(image_0)の衣装・ポーズ・カメラを保ったまま背景だけ世界観に変える。
 * - 2段階の段階2: 段階1の出力(衣装着せ済み)を image_0 として渡し、背景だけ変える。
 *
 * image_1 を渡さないため背景のアングルが image_1 にコピーされない(= 本対策の肝)。
 * 背景の世界観は hidden_prompt の Background 記述をテキストとして使う。
 *
 * @param hiddenPrompt VLM 抽出済みの構造化プロンプト(Background セクションを含む)
 * @param backgroundDirective admin 編集可の背景プロンプト(creator_looks.background_directive)。
 *   {background} に hidden_prompt から抽出した背景の世界観テキストが差し込まれる。
 *   空文字なら従来の固定文にフォールバックする。
 */
export function composeBackgroundStagePrompt(
  hiddenPrompt: string,
  backgroundDirective = "",
): string {
  const bg = extractBackgroundSection(hiddenPrompt);
  const background = bg || "a scene that matches the outfit's mood and world.";

  const directive = backgroundDirective.trim();
  if (directive) {
    // {{background}} があれば置換、無ければ末尾に Background 行を補う。
    return directive.includes("{{background}}")
      ? directive.split("{{background}}").join(background)
      : `${directive}\n\nBackground: ${background}`;
  }

  // フォールバック(従来の固定文)。
  return [
    "Change ONLY the background of `image_0.png`. Keep the character, face, hairstyle, body, outfit, accessories, pose, hand positions, camera angle, viewpoint, framing, crop, and art style of `image_0.png` exactly unchanged.",
    `Background: ${background}`,
    "Redraw the background from image_0's own viewpoint so it fits the existing pose and framing. Do not add or remove any subject. Do not change the clothing.",
  ].join("\n\n");
}
