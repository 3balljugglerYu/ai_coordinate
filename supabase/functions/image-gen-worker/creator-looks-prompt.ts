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
 */
export function composeCreatorLooksPrompt(
  hiddenPrompt: string,
  overrideBackground: boolean,
): string {
  if (overrideBackground) {
    return hiddenPrompt;
  }

  // Background セクションを除去
  const withoutBackground = stripBackgroundSection(hiddenPrompt);

  // 末尾に「元背景を維持」指示を追加
  // (= 既存 Inspire の override_background=false 相当を gpt-image-2 に伝える)
  return `${withoutBackground}\n\n${KEEP_BACKGROUND_DIRECTIVE}`;
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
