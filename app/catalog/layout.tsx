import { Cormorant_Garamond, Libre_Baskerville } from "next/font/google";

/**
 * /catalog 配下だけで使う本らしいセリフフォントを scoped でロードする。
 * - Cormorant Garamond: 表紙・見出し用のエレガントなセリフ
 * - Libre Baskerville: 本文・キャプション用のクラシックなセリフ
 *
 * トップレベル font (Geist) は影響を受けないよう、CSS 変数として刺すだけにする。
 */
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

const libre = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-libre",
  display: "swap",
});

export default function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${cormorant.variable} ${libre.variable}`}>
      {children}
    </div>
  );
}
