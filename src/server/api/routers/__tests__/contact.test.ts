import { describe, expect, it } from "vitest";

import { contactInput } from "@aso/shared";

const valid = {
  name: "Alex Rivera",
  email: "alex@example.com",
  topic: "SALES" as const,
  message: "We run two iOS apps and want to see whether the organic split works for our setup.",
};

describe("contact form validation", () => {
  it("accepts a well-formed message", () => {
    expect(contactInput.safeParse(valid).success).toBe(true);
  });

  it("defaults the topic so the form works without choosing one", () => {
    const { topic: _topic, ...withoutTopic } = valid;
    const parsed = contactInput.parse(withoutTopic);
    expect(parsed.topic).toBe("GENERAL");
  });

  it("trims whitespace so a spaces-only name is not accepted as a name", () => {
    expect(contactInput.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });

  it("lowercases the email so rate limiting cannot be bypassed by casing", () => {
    const parsed = contactInput.parse({ ...valid, email: "Alex@Example.COM" });
    expect(parsed.email).toBe("alex@example.com");
  });

  it("rejects an address that is not an address", () => {
    expect(contactInput.safeParse({ ...valid, email: "alex.example.com" }).success).toBe(false);
  });

  it("rejects a message too short to answer", () => {
    expect(contactInput.safeParse({ ...valid, message: "hi" }).success).toBe(false);
  });

  it("rejects a message long enough to be an attack", () => {
    expect(contactInput.safeParse({ ...valid, message: "x".repeat(4001) }).success).toBe(false);
  });

  it("rejects an unknown topic rather than storing it", () => {
    expect(contactInput.safeParse({ ...valid, topic: "URGENT" }).success).toBe(false);
  });

  it("rejects anything in the honeypot", () => {
    // Real users never see this field, so a filled one is a bot. The parse has
    // to fail here — the handler's silent accept only covers what gets through.
    expect(contactInput.safeParse({ ...valid, website: "http://spam.example" }).success).toBe(
      false,
    );
  });

  it("accepts an empty honeypot, which is what a browser submits", () => {
    expect(contactInput.safeParse({ ...valid, website: "" }).success).toBe(true);
  });

  it("treats company as optional", () => {
    expect(contactInput.safeParse({ ...valid, company: undefined }).success).toBe(true);
    expect(contactInput.safeParse({ ...valid, company: "Acme" }).success).toBe(true);
  });

  it("names the field when it rejects, so the form can point at it", () => {
    const result = contactInput.safeParse({ ...valid, email: "nope" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email?.[0]).toBeTruthy();
    }
  });
});
