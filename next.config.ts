import type { NextConfig } from "next";

// Fail fast on bad env at build time instead of at first request.
import "./src/env";

const config: NextConfig = {
  reactStrictMode: true,
  // Emits .next/standalone — a self-contained server with only the modules it
  // actually imports. The Dockerfile copies that instead of node_modules for
  // the web process; without this the image build has nothing to copy.
  output: "standalone",
  // The shared workspace package ships raw TypeScript, so Next has to compile
  // it rather than treat it as a prebuilt dependency.
  transpilePackages: ["@aso/shared"],
  serverExternalPackages: ["bullmq", "ioredis", "@prisma/client"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "play-lh.googleusercontent.com" },
      { protocol: "https", hostname: "is1-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is2-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is3-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is4-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is5-ssl.mzstatic.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default config;
