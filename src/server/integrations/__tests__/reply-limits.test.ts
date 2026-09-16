import { describe, expect, it, vi } from "vitest";

import { appStoreConnectConnector } from "@/server/integrations/apple/app-store-connect";
import { playConsoleConnector } from "@/server/integrations/google/play-console";
import type { Connection } from "@prisma/client";

/**
 * A reply is public content published under the developer's name, so the
 * guards that stop a bad one leaving the building are worth testing directly.
 */

const connection = { id: "conn_1" } as Connection;

function ctx(kind: "google-oauth" | "apple-asc") {
  return {
    connection,
    credentials:
      kind === "google-oauth"
        ? { kind, accessToken: "token" }
        : { kind, issuerId: "i", keyId: "k", privateKey: "p" },
    externalId: "com.example.app",
    externalRef: null,
    linkMetadata: null,
  } as never;
}

describe("reply character limits", () => {
  it("declares the published per-store limits", () => {
    expect(playConsoleConnector.replyCharLimit).toBe(350);
    expect(appStoreConnectConnector.replyCharLimit).toBe(5970);
  });

  it("Play rejects an over-length reply before any network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      playConsoleConnector.replyToReview!(ctx("google-oauth"), "review_1", "x".repeat(351)),
    ).rejects.toThrow(/350 characters/);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("App Store rejects an over-length reply before any network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      appStoreConnectConnector.replyToReview!(ctx("apple-asc"), "review_1", "x".repeat(5971)),
    ).rejects.toThrow(/5970 characters/);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("rejects an empty reply", async () => {
    await expect(
      playConsoleConnector.replyToReview!(ctx("google-oauth"), "review_1", "   "),
    ).rejects.toThrow(/empty/i);
  });

  it("refuses to publish with the wrong credential type", async () => {
    await expect(
      playConsoleConnector.replyToReview!(ctx("apple-asc"), "review_1", "Thanks!"),
    ).rejects.toThrow(/Google OAuth/);

    await expect(
      appStoreConnectConnector.replyToReview!(ctx("google-oauth"), "review_1", "Thanks!"),
    ).rejects.toThrow(/API key/);
  });

  it("counts characters after trimming, so surrounding whitespace cannot push it over", async () => {
    // 350 characters plus whitespace is still a valid 350. The call still
    // fails — these credentials cannot be refreshed — but it must fail for
    // that reason, not for length.
    const error = await playConsoleConnector
      .replyToReview!(ctx("google-oauth"), "review_1", `  ${"x".repeat(350)}  `)
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).not.toMatch(/350 characters/);
  }, 15000);

  it("rejects one character past the limit", async () => {
    await expect(
      playConsoleConnector.replyToReview!(ctx("google-oauth"), "review_1", "x".repeat(351)),
    ).rejects.toThrow(/limited to 350 characters; this is 351/);
  });
});
