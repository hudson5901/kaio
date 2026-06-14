import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    // Vercel の Image Optimization 月次クォータ (Hobby = 1000) を 16,696 件の
    // 商品 × 複数画像で食い潰して 402 Payment Required を返していた。
    // processed-images は事前加工済みで充分軽く、mercari の元画像もサムネ
    // サイズなので、Vercel 経由の再最適化は不要。直接配信に切替える。
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "static.mercdn.net" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "i.ebayimg.com" },
      { protocol: "https", hostname: "*.ebayimg.com" },
    ],
  },
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
