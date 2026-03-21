import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  cacheComponents: true,
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
