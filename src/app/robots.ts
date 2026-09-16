import type { MetadataRoute } from "next";

import { env } from "@/env";

export default function robots(): MetadataRoute.Robots {
  const base = env.APP_URL.replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Everything here is either behind auth, an API surface, or a
        // single-use link. None of it belongs in an index.
        disallow: ["/api/", "/dashboard", "/apps", "/insights", "/alerts", "/integrations", "/settings", "/signin"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
