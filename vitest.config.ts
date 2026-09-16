import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    env: {
      // Server modules import the typed env at load time. Unit tests exercise
      // pure logic and never reach a real service, so validation is skipped
      // and placeholder secrets are supplied rather than requiring a .env.
      SKIP_ENV_VALIDATION: "1",
      NODE_ENV: "test",
      ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      AUTH_SECRET: "test-secret-value-at-least-16-chars",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@aso/shared": fileURLToPath(
        new URL("./packages/shared/src/index.ts", import.meta.url),
      ),
      // `server-only` throws outside a React Server Component. Under vitest we
      // are already on the server, so it is stubbed rather than removed from
      // the modules under test.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
});
