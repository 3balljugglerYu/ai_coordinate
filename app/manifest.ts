import type { MetadataRoute } from "next";
import { cookies, headers } from "next/headers";
import {
  LOCALE_COOKIE,
  localizePublicPath,
  resolveRequestLocale,
} from "@/i18n/config";
import { getHomeCopy } from "@/i18n/page-copy";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const locale = resolveRequestLocale({
    pathname: "/",
    cookieLocale: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });
  const copy = getHomeCopy(locale);

  return {
    name: "Persta.AI",
    short_name: "Persta.AI",
    description: copy.metadataDescription,
    start_url: localizePublicPath("/", locale),
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
