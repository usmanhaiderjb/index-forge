import { describe, expect, it } from "vitest";

import { buildMessage, classifyFcmError, parseServiceAccount } from "../fcm";

/**
 * FCM message building, error classification and key validation.
 *
 * No Firebase project was available, so these cover the parts that are pure
 * functions of an input — which is where the damage is: a misclassified error
 * retries forever or gives up instantly, and a malformed message fails per app
 * in a way that looks like eleven separate problems.
 */

describe("parseServiceAccount", () => {
  const valid = JSON.stringify({
    type: "service_account",
    project_id: "habitly-prod",
    client_email: "push@habitly-prod.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n",
  });

  it("accepts a service account key", () => {
    const parsed = parseServiceAccount(valid);
    expect(parsed).toMatchObject({
      project_id: "habitly-prod",
      client_email: "push@habitly-prod.iam.gserviceaccount.com",
    });
  });

  it("rejects an OAuth client secret, which looks similar and is not one", () => {
    // The single most likely wrong file to paste: it also comes from Google
    // Cloud, is also JSON, and also has a client_email-ish shape.
    const oauthClient = JSON.stringify({
      type: "authorized_user",
      client_id: "1234.apps.googleusercontent.com",
      client_secret: "abc",
    });
    const result = parseServiceAccount(oauthClient);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("service account");
  });

  it("names the missing field rather than failing generically", () => {
    const noKey = JSON.stringify({
      type: "service_account",
      project_id: "p",
      client_email: "e@example.com",
    });
    expect((parseServiceAccount(noKey) as { error: string }).error).toContain("private_key");

    const noProject = JSON.stringify({
      type: "service_account",
      client_email: "e@example.com",
      private_key: "-----BEGIN PRIVATE KEY-----x-----END PRIVATE KEY-----",
    });
    expect((parseServiceAccount(noProject) as { error: string }).error).toContain("project_id");
  });

  it("rejects non-JSON without throwing", () => {
    expect(parseServiceAccount("not json at all")).toHaveProperty("error");
  });
});

describe("buildMessage", () => {
  const message = { title: "Version 3.2 is live", body: "Streaks now sync across devices." };

  it("sets exactly one target", () => {
    // FCM rejects a message carrying more than one of token/topic/condition.
    const topic = buildMessage({ kind: "topic", topic: "all" }, message).message as Record<
      string,
      unknown
    >;
    expect(topic.topic).toBe("all");
    expect(topic.token).toBeUndefined();
    expect(topic.condition).toBeUndefined();

    const condition = buildMessage(
      { kind: "condition", condition: "'all' in topics" },
      message,
    ).message as Record<string, unknown>;
    expect(condition.condition).toBe("'all' in topics");
    expect(condition.topic).toBeUndefined();
  });

  it("carries a link as data, because FCM has no link field", () => {
    const built = buildMessage({ kind: "topic", topic: "all" }, {
      ...message,
      linkUrl: "https://indexforge.com/whats-new",
    }).message as { data?: Record<string, string> };

    expect(built.data?.link).toBe("https://indexforge.com/whats-new");
  });

  it("omits the data block entirely when there is no link", () => {
    // An empty data object is legal but noise; more importantly some clients
    // branch on data being present to decide whether to handle silently.
    const built = buildMessage({ kind: "topic", topic: "all" }, message).message as {
      data?: unknown;
    };
    expect(built.data).toBeUndefined();
  });

  it("puts the image on the notification, not in data", () => {
    const built = buildMessage({ kind: "topic", topic: "all" }, {
      ...message,
      imageUrl: "https://cdn.example.com/hero.png",
    }).message as { notification?: Record<string, string> };

    expect(built.notification?.image).toBe("https://cdn.example.com/hero.png");
  });
});

describe("classifyFcmError", () => {
  const body = (errorCode: string, status = "INVALID_ARGUMENT") =>
    JSON.stringify({
      error: {
        status,
        message: "something went wrong",
        details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }],
      },
    });

  it("reads the code from details, not the generic top-level status", () => {
    // Firebase returns status INVALID_ARGUMENT with the real reason nested.
    // Reading the top level would classify a dead token as a malformed payload.
    const result = classifyFcmError(400, body("UNREGISTERED"));
    expect(result.code).toBe("UNREGISTERED");
  });

  it("retries only what retrying can fix", () => {
    expect(classifyFcmError(429, body("QUOTA_EXCEEDED", "RESOURCE_EXHAUSTED")).retryable).toBe(true);
    expect(classifyFcmError(503, body("UNAVAILABLE", "UNAVAILABLE")).retryable).toBe(true);

    // Retrying these three times changes nothing and delays the truth.
    expect(classifyFcmError(400, body("INVALID_ARGUMENT")).retryable).toBe(false);
    expect(classifyFcmError(404, body("UNREGISTERED")).retryable).toBe(false);
    expect(classifyFcmError(403, body("SENDER_ID_MISMATCH")).retryable).toBe(false);
  });

  it("treats an unrecognised 5xx as retryable", () => {
    const result = classifyFcmError(500, "<html>Bad Gateway</html>");
    expect(result.code).toBe("UNAVAILABLE");
    expect(result.retryable).toBe(true);
  });

  it("treats an unrecognised 4xx as permanent", () => {
    expect(classifyFcmError(400, "nonsense").retryable).toBe(false);
  });

  it("explains the iOS-specific failure in terms of what to do", () => {
    // THIRD_PARTY_AUTH_ERROR is opaque and extremely common: it means the
    // Firebase project has no APNs key, so every iOS send silently fails.
    const result = classifyFcmError(401, body("THIRD_PARTY_AUTH_ERROR"));
    expect(result.detail).toContain("APNs");
    expect(result.detail).toContain("Firebase");
  });

  it("says a permission failure is about the service account role", () => {
    expect(classifyFcmError(403, body("PERMISSION_DENIED", "PERMISSION_DENIED")).detail).toContain(
      "Firebase Cloud Messaging API Admin",
    );
  });

  it("survives a body that is not JSON", () => {
    const result = classifyFcmError(400, "");
    expect(result.code).toBe("UNKNOWN");
    expect(result.retryable).toBe(false);
  });
});
