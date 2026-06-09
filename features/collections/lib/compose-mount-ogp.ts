import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * X(Twitter) summary_large_image / Facebook 等の OGP カードに最適化された
 * 1200x630(=2:1) の OGP 画像を、生成済みの「縦長コンプリート台紙」と
 * シリーズ名から合成する。
 *
 * デザイン方針(Persta.AI ブランド):
 *  - クリーム→ピーチ→ペールラベンダーのパステルグラデ
 *  - ロゴ(public/icons/icon-512.png のパステル虹色キャラ)を左下に置く
 *  - 中央に台紙を大きく(高さ 540)、ソフトな影とほんのり後光
 *  - 細かなパステルの紙吹雪きらめき(過剰装飾は撤去)
 *  - 右上に COMPLETE バッジ、下に「{シリーズ名} コンプリート台紙」キャプション
 *
 * 注意:
 *  - sharp の SVG テキスト描画は OS のフォントを使う(Vercel/Linux は Noto Sans CJK
 *    が利用可能)。font-family は CJK 名→sans-serif の順で列挙する。
 *  - "use cache" 配下で Math.random は禁止。パーティクル/紙吹雪は LCG(seeded) で
 *    決定論的に生成する。
 */
export async function composeMountOgp(params: {
  mountPng: Buffer;
  displayName: string;
  /** スロット数(=シール種類数)。バッジに「ALL {N}」と入れる */
  threshold?: number;
}): Promise<Buffer> {
  const W = 1200;
  const H = 630;
  const mountHeight = 540;

  // 1) 台紙を等比縮小(高さ 540px)
  const resizedMount = await sharp(params.mountPng)
    .resize({
      height: mountHeight,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const meta = await sharp(resizedMount).metadata();
  const mountW = meta.width ?? 0;

  // 2) 台紙はやや右寄りに配置(左にロゴ・タイトル用の余白を作る)
  const mountLeft = Math.round(W - mountW - 70);
  const mountTop = Math.round((H - mountHeight) / 2);

  // 3) Persta.AI ロゴ(虹色キャラ)を 200px サイズに縮小(下処理しておく)
  let logoBuffer: Buffer | null = null;
  try {
    const rawLogo = await readFile(
      path.join(process.cwd(), "public/icons/icon-512.png"),
    );
    logoBuffer = await sharp(rawLogo)
      .resize(180, 180, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  } catch {
    logoBuffer = null;
  }

  const safeName = escapeXml(params.displayName || "うちの子");
  const safeCount = params.threshold ?? 4;

  // 4) 紙吹雪きらめき(パステル色、細かく散らす)
  const mountZone = {
    x0: mountLeft - 12,
    y0: mountTop - 12,
    x1: mountLeft + mountW + 12,
    y1: mountTop + mountHeight + 12,
  };
  const sparkles = buildSparkles(W, H, mountZone);

  // 5) 背景 SVG
  const bgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- クリーム→ピーチ→ラベンダー -->
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%"   stop-color="#FFF7EE"/>
        <stop offset="55%"  stop-color="#FFE5E0"/>
        <stop offset="100%" stop-color="#EEE3FB"/>
      </linearGradient>
      <!-- 台紙裏のあたたかい後光 -->
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%"  stop-color="#FFD9C0" stop-opacity="0.65"/>
        <stop offset="100%" stop-color="#FFD9C0" stop-opacity="0"/>
      </radialGradient>
      <!-- 上下のアクセント帯(虹) -->
      <linearGradient id="rainbow" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stop-color="#FFB1C9"/>
        <stop offset="25%"  stop-color="#FFD68F"/>
        <stop offset="50%"  stop-color="#FFE9A2"/>
        <stop offset="75%"  stop-color="#B8E5C8"/>
        <stop offset="100%" stop-color="#C7B8F3"/>
      </linearGradient>
      <!-- COMPLETE バッジ -->
      <linearGradient id="badge" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#FFE17A"/>
        <stop offset="100%" stop-color="#F59E0B"/>
      </linearGradient>
      <!-- 台紙のソフトシャドウ -->
      <filter id="mountShadow" x="-15%" y="-15%" width="130%" height="130%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="10"/>
        <feOffset dx="0" dy="8"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0.4  0 0 0 0 0.25  0 0 0 0 0.15  0 0 0 0.22 0"/>
        <feComposite in2="SourceGraphic" operator="over"/>
      </filter>
    </defs>

    <!-- 背景 -->
    <rect width="100%" height="100%" fill="url(#bg)"/>

    <!-- 上下の虹帯 -->
    <rect x="0" y="0" width="${W}" height="4" fill="url(#rainbow)" opacity="0.95"/>
    <rect x="0" y="${H - 4}" width="${W}" height="4" fill="url(#rainbow)" opacity="0.7"/>

    <!-- 台紙の後光 -->
    <ellipse cx="${mountLeft + mountW / 2}" cy="${mountTop + mountHeight / 2}" rx="380" ry="290" fill="url(#glow)"/>

    <!-- 紙吹雪 -->
    <g>
      ${sparkles
        .map(
          (s) =>
            `<circle cx="${s.x}" cy="${s.y}" r="${s.r.toFixed(2)}" fill="${s.color}" opacity="${s.o.toFixed(2)}"/>`,
        )
        .join("")}
    </g>

    <!-- 左サイド: タイトル群 -->
    <g font-family="'Noto Sans CJK JP','Noto Sans JP','Hiragino Sans','Yu Gothic',sans-serif" text-anchor="start">
      <!-- 小さなラベル -->
      <text x="70" y="210" font-family="'Inter','Helvetica Neue',Arial,sans-serif" font-size="14" font-weight="800" fill="#B45309" letter-spacing="6">COLLECTION</text>
      <!-- メインタイトル -->
      <text x="70" y="282" font-size="42" font-weight="800" fill="#3D2A14">うちの子の</text>
      <text x="70" y="346" font-size="50" font-weight="800" fill="#E77B2C">${safeName}</text>
      <text x="70" y="402" font-size="34" font-weight="700" fill="#3D2A14">コンプリート台紙</text>
      <!-- サブコピー -->
      <text x="70" y="448" font-size="16" font-weight="500" fill="#7A6A58">あつめたシールが、ひとつの宝物に。</text>
    </g>

    <!-- 左下: ブランド名(ロゴはあとから composite) -->
    <g font-family="'Inter','Helvetica Neue',Arial,sans-serif">
      <text x="248" y="556" font-size="22" font-weight="800" fill="#3D2A14" letter-spacing="0.5">Persta.AI</text>
      <text x="248" y="582" font-family="'Noto Sans CJK JP','Noto Sans JP',sans-serif" font-size="13" font-weight="600" fill="#9A8A78">ペルスタ — うちの子と毎日</text>
    </g>

    <!-- 右上: COMPLETE バッジ -->
    <g transform="translate(${W - 196} 28)">
      <rect width="160" height="44" rx="22" ry="22" fill="url(#badge)"/>
      <text x="80" y="29" font-family="Arial, sans-serif" font-size="14" font-weight="800" fill="#3D2A0E" text-anchor="middle" letter-spacing="2.5">★ ALL ${safeCount} ★</text>
    </g>
  </svg>`;

  // 6) 合成: 背景 → 台紙(影付き) → ロゴ
  const composites: sharp.OverlayOptions[] = [
    { input: resizedMount, left: mountLeft, top: mountTop },
  ];
  if (logoBuffer) {
    // 左下にロゴを配置(180x180)
    composites.push({ input: logoBuffer, left: 56, top: 470 });
  }

  return sharp(Buffer.from(bgSvg))
    .composite(composites)
    .png()
    .toBuffer();
}

/**
 * パステル紙吹雪。"use cache" 配下で Math.random は禁止のため LCG で生成。
 */
function buildSparkles(
  W: number,
  H: number,
  exclude: { x0: number; y0: number; x1: number; y1: number },
): { x: number; y: number; r: number; o: number; color: string }[] {
  const palette = [
    "#FFB1C9", // pink
    "#FFD68F", // peach
    "#FFE9A2", // yellow
    "#B8E5C8", // mint
    "#C7B8F3", // lavender
    "#FFFFFF",
  ];
  let seed = 246813579;
  function rand() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x80000000;
  }
  const out: { x: number; y: number; r: number; o: number; color: string }[] =
    [];
  let safety = 0;
  while (out.length < 70 && safety++ < 700) {
    const x = Math.round(rand() * W);
    const y = Math.round(rand() * H);
    if (
      x >= exclude.x0 &&
      x <= exclude.x1 &&
      y >= exclude.y0 &&
      y <= exclude.y1
    ) {
      continue;
    }
    out.push({
      x,
      y,
      r: 1.2 + rand() * 2.8,
      o: 0.35 + rand() * 0.55,
      color: palette[Math.floor(rand() * palette.length)],
    });
  }
  return out;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 台紙のストレージパス(`.../mount-{ts}.png`)から OGP のパス(`.../ogp-{ts}.png`)を導出。
 */
export function ogpPathFromMountPath(mountPath: string): string | null {
  if (!mountPath.includes("/mount-")) return null;
  return mountPath.replace("/mount-", "/ogp-");
}
