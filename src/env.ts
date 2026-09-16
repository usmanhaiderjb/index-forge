import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Typed environment. Server keys are stripped from the client bundle by
 * @t3-oss/env-nextjs, so importing this file from a client component only
 * exposes the `client` block.
 *
 * Set SKIP_ENV_VALIDATION=1 for Docker builds that have no secrets yet.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.string().url().default("http://localhost:3000"),

    DATABASE_URL: z.string().url(),
    DIRECT_URL: z.string().url().optional(),
    REDIS_URL: z.string().url().default("redis://localhost:6379"),

    AUTH_SECRET: z.string().min(16),
    AUTH_URL: z.string().url().optional(),
    AUTH_TRUST_HOST: z.string().optional(),
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),

    // 32 bytes, base64.
    ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, {
        message: "ENCRYPTION_KEY must be 32 bytes encoded as base64",
      }),

    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
    GEMINI_MODEL_BULK: z.string().default("gemini-2.5-flash"),

    ANTHROPIC_API_KEY: z.string().optional(),
    /**
     * Bearer-token auth, for gateways that expect it.
     *
     * Anthropic authenticates with `x-api-key`; AgentRouter and most
     * Anthropic-compatible relays expect `Authorization: Bearer`. The SDK sends
     * one or the other depending on which of these is set, and getting it wrong
     * produces a 401 that looks identical to a bad key.
     *
     * Set this **or** ANTHROPIC_API_KEY, not both.
     */
    ANTHROPIC_AUTH_TOKEN: z.string().optional(),
    /**
     * Override for an Anthropic-compatible gateway — AgentRouter, a proxy, a
     * self-hosted relay.
     *
     * Left unset it talks to Anthropic directly. Worth knowing what setting it
     * means: every prompt, and therefore every review body and every piece of
     * customer metadata sent to the AI features, is routed through whoever runs
     * that endpoint. That is a data-processing decision, not a configuration
     * detail.
     *
     * No trailing path. AgentRouter's Anthropic-compatible base is
     * `https://agentrouter.org` — its `/v1` endpoint is the OpenAI-compatible
     * one and will not work with this client.
     */
    ANTHROPIC_BASE_URL: z.string().url().optional(),
    ANTHROPIC_MODEL: z.string().default("claude-opus-5"),
    ANTHROPIC_MODEL_BULK: z.string().default("claude-sonnet-5"),
    ANTHROPIC_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("high"),
    AI_MONTHLY_TOKEN_BUDGET: z.coerce.number().int().min(0).default(2_000_000),

    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional(),
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: z.string().optional(),

    APPLE_ASC_ISSUER_ID: z.string().optional(),
    APPLE_ASC_KEY_ID: z.string().optional(),
    APPLE_ASC_PRIVATE_KEY: z.string().optional(),

    ASO_PROVIDER: z.enum(["builtin", "apptweak", "sensortower"]).default("builtin"),
    APPTWEAK_API_KEY: z.string().optional(),
    SENSORTOWER_API_KEY: z.string().optional(),
    ASO_USER_AGENT: z.string().default("ASO-Dashboard/0.1"),
    ASO_SCRAPE_DELAY_MS: z.coerce.number().int().min(0).default(1200),
    /**
     * Floor for the stores' *search* endpoints, which are far less tolerant
     * than autocomplete. Measured, not guessed: over a five-hour corpus build,
     * the two autocomplete hosts were never rate limited once, while both
     * search hosts throttled us repeatedly. See docs/KEYWORD-DATABASE.md.
     */
    ASO_SEARCH_DELAY_MS: z.coerce.number().int().min(0).default(4000),

    CRON_SECRET: z.string().optional(),
    RUN_INLINE_WORKER: z
      .string()
      .optional()
      .transform((v) => v === "true" || v === "1"),
  },
  client: {
    NEXT_PUBLIC_APP_NAME: z.string().default("IndexForge"),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    /**
     * The fallback is repeated here on purpose.
     *
     * `skipValidation` below is on for Docker builds, and it bypasses zod
     * entirely — schema defaults included. So `APP_URL` was typed `string` but
     * arrived as `undefined`, and `new URL(env.APP_URL)` in the root layout
     * failed the whole image build with `ERR_INVALID_URL` on `/_not-found`.
     * A host build never hit it because `.env` supplied the value.
     *
     * Note this is only a floor. `metadataBase` is resolved at build time for
     * statically prerendered pages, so a real deployment must still pass its
     * own APP_URL at build time or ship canonical and og:image URLs pointing at
     * localhost. See the APP_URL build argument in the Dockerfile.
     */
    APP_URL: process.env.APP_URL ?? "http://localhost:3000",
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    REDIS_URL: process.env.REDIS_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_URL: process.env.AUTH_URL,
    AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    GEMINI_MODEL_BULK: process.env.GEMINI_MODEL_BULK,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
    ANTHROPIC_MODEL_BULK: process.env.ANTHROPIC_MODEL_BULK,
    ANTHROPIC_EFFORT: process.env.ANTHROPIC_EFFORT,
    AI_MONTHLY_TOKEN_BUDGET: process.env.AI_MONTHLY_TOKEN_BUDGET,
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_ADS_DEVELOPER_TOKEN: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    APPLE_ASC_ISSUER_ID: process.env.APPLE_ASC_ISSUER_ID,
    APPLE_ASC_KEY_ID: process.env.APPLE_ASC_KEY_ID,
    APPLE_ASC_PRIVATE_KEY: process.env.APPLE_ASC_PRIVATE_KEY,
    ASO_PROVIDER: process.env.ASO_PROVIDER,
    APPTWEAK_API_KEY: process.env.APPTWEAK_API_KEY,
    SENSORTOWER_API_KEY: process.env.SENSORTOWER_API_KEY,
    ASO_USER_AGENT: process.env.ASO_USER_AGENT,
    ASO_SCRAPE_DELAY_MS: process.env.ASO_SCRAPE_DELAY_MS,
    ASO_SEARCH_DELAY_MS: process.env.ASO_SEARCH_DELAY_MS,
    CRON_SECRET: process.env.CRON_SECRET,
    RUN_INLINE_WORKER: process.env.RUN_INLINE_WORKER,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
