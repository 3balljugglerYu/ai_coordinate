import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { locales } from "./i18n/config";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/*
  生成モード Coordinate は廃止した（docs/planning/coordinate-mode-deprecation-plan.md）。
  検索・ブックマーク・お知らせ本文に残る旧 URL は Free Style へ送る。
  - ロケールは列挙する。任意の1階層（/:locale/coordinate）にすると
    /styles/coordinate のような別ページまで拾ってしまう
  - いまは一時転送(307)。ページのコードを消す段階で恒久転送(308)にする。
    恒久転送はブラウザや検索エンジンに覚えられ、戻しにくいため
*/
const COORDINATE_REDIRECT_PERMANENT = false;

const nextConfig: NextConfig = {
  cacheComponents: true,
  // dev サーバへ LAN 内の別端末(スマホ実機確認など)からアクセスする際の
  // クロスオリジン保護を許可する。production では無視される dev 専用設定。
  // 個人IPは埋め込まずプライベートレンジのワイルドカードのみ許可する。
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*"],
  async redirects() {
    return [
      {
        source: "/event/detail/01",
        destination: "/free-materials",
        permanent: true,
      },
      {
        source: "/thanks",
        destination: "/thanks-sample",
        permanent: true,
      },
      {
        source: "/coordinate",
        destination: "/free",
        permanent: COORDINATE_REDIRECT_PERMANENT,
      },
      {
        source: `/:locale(${locales.join("|")})/coordinate`,
        destination: "/:locale/free",
        permanent: COORDINATE_REDIRECT_PERMANENT,
      },
    ];
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
    // proxy.ts / middleware 経由時のリクエストボディ上限（デフォルト 10MB）
    // 再生成時は base + character + result の3画像になるため引き上げる
    proxyClientMaxBodySize: "25mb",
    // ページ遷移時の Client-Side Router Cache を有効化
    // 一度訪れたページに戻る際、キャッシュを再利用してローディングを軽減
    staleTimes: {
      dynamic: 300, // 動的ページ: 5分間キャッシュ（ホームなど他画面から戻った際に即表示）
      static: 300, // プリフェッチ済み: 5分（デフォルト維持）
    },
  },
  images: {
    localPatterns: [
      {
        pathname: "/**",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
