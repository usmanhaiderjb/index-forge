import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

// The crypto module reads ENCRYPTION_KEY through the typed env at import time.
beforeAll(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
  process.env.ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
});

describe("credential encryption", () => {
  it("round-trips a credential blob", async () => {
    const { decryptJson, encryptJson } = await import("@/server/crypto");
    const credentials = { kind: "google-oauth", accessToken: "ya29.abc", expiresAt: 1234 };

    expect(decryptJson(encryptJson(credentials))).toEqual(credentials);
  });

  it("produces a different ciphertext every time", async () => {
    const { encryptJson } = await import("@/server/crypto");
    expect(encryptJson({ a: 1 })).not.toBe(encryptJson({ a: 1 }));
  });

  it("rejects a tampered payload rather than returning garbage", async () => {
    const { decryptJson, encryptJson } = await import("@/server/crypto");
    const payload = encryptJson({ secret: "value" });

    const parts = payload.split(".");
    const data = Buffer.from(parts[3]!, "base64");
    data[0] = data[0]! ^ 0xff;
    parts[3] = data.toString("base64");

    expect(() => decryptJson(parts.join("."))).toThrow();
  });

  it("rejects a malformed payload", async () => {
    const { decryptJson } = await import("@/server/crypto");
    expect(() => decryptJson("not-a-ciphertext")).toThrow("Malformed ciphertext");
  });

  it("tryDecryptJson returns null instead of throwing", async () => {
    const { tryDecryptJson } = await import("@/server/crypto");
    expect(tryDecryptJson("garbage")).toBeNull();
    expect(tryDecryptJson(null)).toBeNull();
  });
});

describe("api keys", () => {
  it("stores only a hash and shows the plaintext once", async () => {
    const { generateApiKey, sha256 } = await import("@/server/crypto");
    const { plaintext, hashed, prefix } = generateApiKey();

    expect(plaintext.startsWith("aso_")).toBe(true);
    expect(hashed).toBe(sha256(plaintext));
    expect(plaintext.startsWith(prefix)).toBe(true);
    expect(hashed).not.toContain(plaintext);
  });
});

describe("safeEqual", () => {
  it("compares equal and unequal strings without throwing on length mismatch", async () => {
    const { safeEqual } = await import("@/server/crypto");
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "secreu")).toBe(false);
    expect(safeEqual("secret", "longer-secret")).toBe(false);
  });
});
