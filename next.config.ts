import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  async redirects() {
    return [
      {
        source: "/event/detail/01",
        destination: "/free-materials",
        permanent: true,
      },
    ];
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
    // ページ遷移時の Client-Side Router Cache を有効化
    // 一度訪れたページに戻る際、キャッシュを再利用してローディングを軽減
    staleTimes: {
      dynamic: 300, // 動的ページ: 5分間キャッシュ（ホームなど他画面から戻った際に即表示）
      static: 300, // プリフェッチ済み: 5分（デフォルト維持）
    },
  },
  images: {
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

export default nextConfig;
