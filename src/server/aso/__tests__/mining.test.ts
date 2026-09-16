import { describe, expect, it } from "vitest";

import { extractTerms, ngrams, presenceScore, tokenize } from "../mining";
import type { AsoAppDetail } from "../types";

/**
 * Metadata mining's pure half.
 *
 * The failure mode this guards against is not a crash. It is a corpus that
 * fills with sentence fragments, or a category whose vocabulary is decided by
 * whichever app repeated a word the most times — both of which look like a
 * working keyword database right up until someone tries to use it.
 */

function app(fields: Partial<AsoAppDetail>): AsoAppDetail {
  return {
    platform: "IOS",
    storeId: "1",
    name: "Example",
    ...fields,
  };
}

describe("tokenize", () => {
  it("splits on punctuation and lowercases", () => {
    expect(tokenize("Habit-Tracker: Daily Goals!")).toEqual([
      "habit",
      "tracker",
      "daily",
      "goals",
    ]);
  });

  it("keeps digits and plus signs, which are real app vocabulary", () => {
    expect(tokenize("Fitness 24/7 Pro+")).toEqual(["fitness", "24", "7", "pro+"]);
  });
});

describe("ngrams", () => {
  it("returns every window from one to three words", () => {
    expect(ngrams(["habit", "tracker"])).toEqual(["habit", "tracker", "habit tracker"]);
  });

  it("drops fragments that start or end on a stopword", () => {
    // "tracker for" and "for habits" are prose, not searches.
    const grams = ngrams(["tracker", "for", "habits"]);
    expect(grams).not.toContain("tracker for");
    expect(grams).not.toContain("for habits");
    expect(grams).toContain("tracker for habits");
  });

  it("keeps stopwords inside a phrase", () => {
    expect(ngrams(["time", "to", "focus"])).toContain("time to focus");
  });

  it("returns nothing for an empty token list", () => {
    expect(ngrams([])).toEqual([]);
  });

  it("rejects multi-word runs of very short tokens", () => {
    // Play listings carry a supported-languages list. Tokenised, it produces
    // "fa ar hu" and "cz for help", both of which reached the corpus on the
    // first real mining run.
    //
    // The individual tokens survive here — "ai" and "vr" are the same shape
    // and are real terms — as does "cz for help", which contains one long
    // word. Those are caught further down by the field-weight floor, since
    // nothing reached them from a title. This rule only removes the runs that
    // are short tokens end to end.
    const grams = ngrams(["fa", "ar", "hu"]);

    expect(grams).toEqual(["fa", "ar", "hu"]);
    expect(grams).not.toContain("fa ar");
    expect(grams).not.toContain("fa ar hu");
  });

  it("keeps a short token beside a substantial one", () => {
    expect(ngrams(["ai", "planner"])).toContain("ai planner");
  });

  it("keeps a single short word, which may be a real search", () => {
    expect(ngrams(["3d"])).toEqual(["3d"]);
  });

  it("drops function words that appeared as standalone keywords", () => {
    expect(ngrams(["into"])).toEqual([]);
    expect(ngrams(["every"])).toEqual([]);
  });

  it("still allows a function word inside a phrase", () => {
    expect(ngrams(["all", "in", "one"])).toContain("all in one");
  });
});

describe("extractTerms", () => {
  it("scores a title term above a description term", () => {
    const terms = extractTerms(
      app({ title: "Budget", description: "Also a savings planner" }),
      "IOS",
    );

    expect(terms.get("budget")).toBeGreaterThan(terms.get("savings") ?? 0);
  });

  it("scores each term once per app, however often it is repeated", () => {
    // Keyword stuffing is common. If repetition counted, one app could decide
    // what an entire category is about.
    const stuffed = extractTerms(
      app({ title: "Budget", description: "budget budget budget budget" }),
      "ANDROID",
    );
    const plain = extractTerms(app({ title: "Budget" }), "ANDROID");

    expect(stuffed.get("budget")).toBe(plain.get("budget"));
  });

  it("weights the Play description far above the App Store one", () => {
    // Apple does not index descriptions; Google does. Mining them identically
    // would put iOS marketing prose on the same footing as a Play title.
    const detail = app({ name: "X", description: "expense manager" });

    const ios = extractTerms(detail, "IOS").get("expense") ?? 0;
    const android = extractTerms(detail, "ANDROID").get("expense") ?? 0;

    expect(android).toBeGreaterThan(ios);
  });

  it("falls back to the store name when there is no separate title", () => {
    expect(extractTerms(app({ name: "Sleep Cycle" }), "IOS").has("sleep cycle")).toBe(true);
  });

  it("drops terms the corpus filter rejects", () => {
    const terms = extractTerms(app({ title: "A 12345" }), "IOS");

    expect(terms.has("a")).toBe(false);
    expect(terms.has("12345")).toBe(false);
  });
});

describe("presenceScore", () => {
  it("reports a term every ranked app puts in its title as 100", () => {
    expect(presenceScore(20, 20)).toBe(100);
  });

  it("halves for a term in half the apps", () => {
    expect(presenceScore(10, 20)).toBe(50);
  });

  it("clamps rather than exceeding 100", () => {
    expect(presenceScore(25, 20)).toBe(100);
  });

  it("returns zero when nothing was read, rather than dividing by zero", () => {
    expect(presenceScore(5, 0)).toBe(0);
    expect(Number.isFinite(presenceScore(5, 0))).toBe(true);
  });
});
