import { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl() || "https://persta.ai";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard/", "/i2i/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
