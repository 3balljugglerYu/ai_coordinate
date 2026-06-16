/**
 * スカロップ(波打ち)型のゴールドバッジ + 王冠 + 「○○%／達成!」を描く SVG。
 * 画像素材を持たずインラインで完結し、画面幅に応じて拡縮しても崩れない。
 *
 * - color / textColor / bgColor が null のときは従来のデフォルト配色を使う。
 * - animate(default true): % 数字に coll-pop アニメを付ける。静的プレビュー等で
 *   アニメを止めたいときは false を渡す(animation/coll-pop を出力しない)。
 *   ※ coll-pop の @keyframes は呼び出し側(モーダル)の <style> に定義がある前提。
 */
export function AchievementBadge({
  percent,
  color,
  textColor,
  bgColor,
  animate = true,
}: {
  percent: number;
  color?: string | null;
  textColor?: string | null;
  bgColor?: string | null;
  animate?: boolean;
}) {
  // 10弁のスカロップを極座標で生成(内/外を交互に)
  const cx = 50;
  const cy = 50;
  const petals = 10;
  const rOuter = 44;
  const rInner = 38;
  const pts: string[] = [];
  for (let i = 0; i < petals * 2; i++) {
    const a = (i * Math.PI) / petals - Math.PI / 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return (
    <svg
      viewBox="0 0 100 100"
      className="h-full w-full drop-shadow-[0_2px_4px_rgba(180,90,20,0.35)]"
      aria-hidden
    >
      <defs>
        <radialGradient id="badgeFill" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#FFFBEB" />
          <stop offset="70%" stopColor="#FEF3C7" />
          <stop offset="100%" stopColor="#FDE68A" />
        </radialGradient>
        <linearGradient id="badgeStroke" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FCD34D" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      {/* 外側スカロップ(濃ゴールド)。color 指定時はその単色で塗る。 */}
      <polygon points={pts.join(" ")} fill={color ?? "url(#badgeStroke)"} />
      {/* 内側スカロップ(中身)。やや小さい同形で重ねて縁取りを作る */}
      <polygon
        points={pts
          .map((p) => {
            const [x, y] = p.split(",").map(Number);
            return `${(cx + (x - cx) * 0.86).toFixed(2)},${(cy + (y - cy) * 0.86).toFixed(2)}`;
          })
          .join(" ")}
        fill={bgColor ?? "url(#badgeFill)"}
      />
      {/* 王冠(シンプル) - %が真ん中にくるよう下にシフト。color 指定時はその色。 */}
      <g transform="translate(50 31)">
        <path
          d="M -7 6 L -7 -1 L -3 3 L 0 -4 L 3 3 L 7 -1 L 7 6 Z"
          fill={color ?? "#F59E0B"}
          stroke="#FFFFFF"
          strokeWidth="0.6"
          strokeLinejoin="round"
        />
        <circle cx="-7" cy="-1" r="1.2" fill={color ?? "#F59E0B"} />
        <circle cx="0" cy="-4" r="1.3" fill={color ?? "#F59E0B"} />
        <circle cx="7" cy="-1" r="1.2" fill={color ?? "#F59E0B"} />
      </g>
      {/* 「○○%」(オレンジ・大きめ) - バッジ中央に配置
            カウントアップ後半でぴょこっと拡縮(coll-pop)。SVG <text> は
            transform-box=fill-box で自身の中心を回転原点にできる。
            animate=false のときは coll-pop を付けない(静的プレビュー用)。 */}
      <text
        x="50"
        y="57"
        textAnchor="middle"
        fontFamily="'Mochiy Pop One','Zen Maru Gothic',system-ui,sans-serif"
        fontWeight="700"
        fontSize="20"
        fill={textColor ?? "#F97316"}
        style={{
          transformBox: "fill-box",
          transformOrigin: "center",
          animation: animate ? "coll-pop 1400ms ease-out both" : undefined,
        }}
      >
        {percent}%
      </text>
      {/* 「達成!」 - %の直下 */}
      <text
        x="50"
        y="69"
        textAnchor="middle"
        fontFamily="'Mochiy Pop One','Zen Maru Gothic',system-ui,sans-serif"
        fontWeight="700"
        fontSize="9"
        fill={textColor ?? "#B45309"}
      >
        達成！
      </text>
    </svg>
  );
}
