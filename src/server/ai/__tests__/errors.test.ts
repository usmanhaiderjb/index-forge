import { describe, expect, it } from "vitest";

import { describeAiError } from "@/server/ai/client";

/**
 * Provider failures reach the user in a toast. What matters is whether the
 * message says whose problem it is and what to do — a raw JSON blob says
 * neither.
 */
describe("describeAiError", () => {
  it("names billing as the fix when credits run out", () => {
    const error = Object.assign(
      new Error(
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
      ),
      { status: 400 },
    );

    const message = describeAiError(error);
    expect(message).toMatch(/no credits/i);
    expect(message).toMatch(/console\.anthropic\.com/);
    // The raw payload must not leak through.
    expect(message).not.toMatch(/invalid_request_error/);
  });

  it("points at the key on an auth failure", () => {
    const error = Object.assign(new Error("authentication_error: invalid x-api-key"), {
      status: 401,
    });
    expect(describeAiError(error)).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("says to wait on a rate limit rather than blaming the user", () => {
    const error = Object.assign(new Error("rate_limit_error"), { status: 429 });
    expect(describeAiError(error)).toMatch(/wait a moment/i);
  });

  it("treats overload as transient", () => {
    const error = Object.assign(new Error("overloaded_error"), { status: 529 });
    expect(describeAiError(error)).toMatch(/try again shortly/i);
  });

  it("points at the model setting when the model is unavailable", () => {
    const error = Object.assign(new Error("not_found_error: model not found"), { status: 404 });
    expect(describeAiError(error)).toMatch(/ANTHROPIC_MODEL/);
  });

  it("truncates an unrecognised error rather than dumping it", () => {
    const message = describeAiError(new Error("x".repeat(2000)));
    expect(message.length).toBeLessThanOrEqual(400);
  });

  it("handles a non-Error value", () => {
    expect(describeAiError("something broke")).toBe("something broke");
  });
});
