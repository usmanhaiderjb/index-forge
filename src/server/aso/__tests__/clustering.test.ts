import { describe, expect, it } from "vitest";

import {
  cluster,
  prefixWeight,
  relatedness,
  relatedTo,
  serpOverlap,
  tokenOverlap,
  type ClusterInput,
} from "../clustering";

/**
 * Clustering.
 *
 * The two failure modes worth guarding are both silent. One is an alphabet
 * masquerading as topics — every term beginning "ha" in a bucket together
 * because they share a two-letter prefix. The other is the single-bucket
 * collapse, where chained similarity merges everything into one cluster whose
 * ends are unrelated. Both look like working output.
 */

function node(term: string, over: Partial<ClusterInput> = {}): ClusterInput {
  return {
    id: over.id ?? term,
    term,
    demand: over.demand ?? 50,
    prefixes: over.prefixes ?? [],
    categories: over.categories ?? [],
    apps: over.apps ?? [],
  };
}

describe("prefixWeight", () => {
  it("treats a specific prefix as far stronger evidence than a vague one", () => {
    expect(prefixWeight("habit t")).toBeGreaterThan(prefixWeight("ha"));
  });

  it("gives a single letter almost nothing", () => {
    // Otherwise every term starting with "h" is related to every other one.
    expect(prefixWeight("h")).toBeLessThan(0.1);
  });

  it("caps at 1 rather than rewarding ever-longer prefixes", () => {
    expect(prefixWeight("habit tracker widget")).toBe(1);
  });

  it("will not group two terms on a short prefix alone", () => {
    // "ba k" put backyard baseball, background eraser, backrooms 2 and backup
    // sms in one cluster of twelve. A shared stem needs corroboration.
    expect(prefixWeight("ba k")).toBeLessThan(0.45);
  });
});

describe("tokenOverlap", () => {
  it("scores identical wording as 1", () => {
    expect(tokenOverlap("habit tracker", "habit tracker")).toBe(1);
  });

  it("scores a shared word partially", () => {
    const score = tokenOverlap("habit tracker", "habit journal");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("scores unrelated wording as 0", () => {
    expect(tokenOverlap("pedometer", "budget planner")).toBe(0);
  });
});

describe("serpOverlap", () => {
  it("treats three shared apps out of ten as strong evidence", () => {
    // Jaccard would score this 3/17 and call the pair unrelated. Three of the
    // same apps ranking for both terms is the store saying they are one search.
    const score = serpOverlap(["a", "b", "c", "d", "e"], ["a", "b", "c", "x", "y"]);

    expect(score).toBeGreaterThanOrEqual(0.45);
  });

  it("saturates once the result sets mostly agree", () => {
    expect(serpOverlap(["a", "b", "c", "d", "e"], ["a", "b", "c", "d", "e"])).toBe(1);
  });

  it("says nothing about a term whose difficulty was never scanned", () => {
    // Empty is "not measured", not "no overlap", and must not read as evidence
    // of unrelatedness.
    expect(serpOverlap([], ["a", "b"])).toBe(0);
  });

  it("scores disjoint result sets as zero", () => {
    expect(serpOverlap(["a", "b"], ["x", "y"])).toBe(0);
  });
});

describe("relatedness", () => {
  it("leaves two terms sharing only a stem unrelated", () => {
    const relation = relatedness(
      node("backyard baseball", { prefixes: ["ba k"] }),
      node("backup sms", { prefixes: ["ba k"] }),
    );

    expect(relation.score).toBeLessThan(0.45);
  });

  it("groups them anyway once a second signal agrees", () => {
    // "bbc news" and "bbc sport" share the same weak prefix, but also a word.
    const relation = relatedness(
      node("bbc news", { prefixes: ["bb c"] }),
      node("bbc sport", { prefixes: ["bb c"] }),
    );

    expect(relation.score).toBeGreaterThanOrEqual(0.45);
  });

  it("lets shared ranking apps outweigh a lexical coincidence", () => {
    // The case prefix matching gets wrong: two unrelated terms completing from
    // the same four letters. Real result sets settle it.
    const relation = relatedness(
      node("backyard baseball", { prefixes: ["ba k"], apps: ["a", "b", "c"] }),
      node("background eraser", { prefixes: ["ba k"], apps: ["x", "y", "z"] }),
    );

    expect(relation.reason).toBe("prefix");
    expect(relation.score).toBeLessThan(0.7);
  });

  it("relates two terms the same apps rank for, whatever the wording", () => {
    const relation = relatedness(
      node("pedometer", { apps: ["a", "b", "c", "d"] }),
      node("step counter", { apps: ["a", "b", "c", "d"] }),
    );

    expect(relation.reason).toBe("results");
    expect(relation.detail).toContain("4 of the same apps");
    expect(relation.score).toBeGreaterThan(0.45);
  });

  it("relates terms the store completed from the same specific prefix", () => {
    const relation = relatedness(
      node("habit tracker", { prefixes: ["habit t"] }),
      node("habit tracker widget", { prefixes: ["habit t"] }),
    );

    expect(relation.reason).toBe("prefix");
    expect(relation.detail).toContain("habit t");
  });

  it("does not relate terms that merely start with the same two letters", () => {
    const relation = relatedness(
      node("hair color", { prefixes: ["ha"] }),
      node("hamster care", { prefixes: ["ha"] }),
    );

    expect(relation.score).toBeLessThan(0.45);
  });

  it("relates terms with no words in common through their category", () => {
    // The whole reason category co-occurrence is worth carrying: these two are
    // the same search and share not one character.
    const relation = relatedness(
      node("pedometer", { categories: ["IOS:6013"] }),
      node("step counter", { categories: ["IOS:6013"] }),
    );

    expect(relation.reason).toBe("category");
    expect(relation.score).toBeGreaterThan(0.45);
  });

  it("does not relate a term that appears in every category to everything in one", () => {
    // "google" ranks in eight category charts, so sharing one of them with
    // "secure vpn" is a coincidence. Counting shared categories put those two
    // in a cluster together; the share is what matters.
    const generic = node("google", {
      categories: ["A", "B", "C", "D", "E", "F", "G", "H"],
    });
    const specific = node("secure vpn", { categories: ["A"] });

    expect(relatedness(generic, specific).score).toBeLessThan(0.45);
  });

  it("still relates two terms whose only category is the same one", () => {
    const relation = relatedness(
      node("pedometer", { categories: ["IOS:6013"] }),
      node("step counter", { categories: ["IOS:6013"] }),
    );

    expect(relation.score).toBeGreaterThanOrEqual(0.45);
  });

  it("reports no shared evidence rather than inventing a weak link", () => {
    const relation = relatedness(node("pedometer"), node("budget planner"));

    expect(relation.score).toBe(0);
    expect(relation.detail).toBe("no shared evidence");
  });

  it("lets corroborating signals strengthen a pair without inventing one", () => {
    const alone = relatedness(
      node("habit tracker", { prefixes: ["habit t"] }),
      node("habit tracker widget", { prefixes: ["habit t"] }),
    );
    const corroborated = relatedness(
      node("habit tracker", { prefixes: ["habit t"], categories: ["IOS:6013"] }),
      node("habit tracker widget", { prefixes: ["habit t"], categories: ["IOS:6013"] }),
    );

    expect(corroborated.score).toBeGreaterThanOrEqual(alone.score);
    expect(relatedness(node("a thing"), node("b other")).score).toBe(0);
  });

  it("names a term as related to itself without pretending to explain it", () => {
    const self = node("habit tracker");
    expect(relatedness(self, self).score).toBe(1);
  });
});

describe("cluster", () => {
  it("labels each cluster with its highest-demand term", () => {
    const clusters = cluster([
      node("habit tracker widget", { demand: 40, prefixes: ["habit t"] }),
      node("habit tracker", { demand: 90, prefixes: ["habit t"] }),
    ]);

    expect(clusters[0]?.label).toBe("habit tracker");
  });

  it("keeps unrelated topics apart", () => {
    const clusters = cluster([
      node("habit tracker", { demand: 90, prefixes: ["habit t"] }),
      node("habit tracker widget", { demand: 40, prefixes: ["habit t"] }),
      node("budget planner", { demand: 80, prefixes: ["budget p"] }),
      node("budget planner free", { demand: 30, prefixes: ["budget p"] }),
    ]);

    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => c.members.length === 2)).toBe(true);
  });

  it("does not chain unrelated terms into one bucket", () => {
    // A relates to B, B relates to C, but A and C share nothing. Connected
    // components would merge all three; star clustering must not.
    const clusters = cluster([
      node("aa", { id: "a", demand: 90, prefixes: ["shared ab"] }),
      node("bb", { id: "b", demand: 80, prefixes: ["shared ab", "shared bc"] }),
      node("cc", { id: "c", demand: 70, prefixes: ["shared bc"] }),
    ]);

    const bucket = clusters.find((c) => c.members.length > 1);
    expect(bucket?.members.map((m) => m.id).sort()).toEqual(["a", "b"]);
    expect(clusters.find((c) => c.label === "cc")?.members).toHaveLength(1);
  });

  it("returns a term nothing relates to as its own cluster", () => {
    const clusters = cluster([node("orphan", { demand: 10 })]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.members).toHaveLength(1);
  });

  it("orders the biggest clusters first", () => {
    const clusters = cluster([
      node("solo", { demand: 100 }),
      node("pair a", { demand: 50, prefixes: ["pair x"] }),
      node("pair b", { demand: 40, prefixes: ["pair x"] }),
    ]);

    expect(clusters[0]?.members).toHaveLength(2);
  });

  it("assigns every term exactly once", () => {
    const inputs = [
      node("one", { demand: 90, prefixes: ["shared"] }),
      node("two", { demand: 80, prefixes: ["shared"] }),
      node("three", { demand: 70, prefixes: ["shared"] }),
    ];

    const seen = cluster(inputs).flatMap((c) => c.members.map((m) => m.id));

    expect(seen).toHaveLength(inputs.length);
    expect(new Set(seen).size).toBe(inputs.length);
  });
});

describe("relatedTo", () => {
  it("returns the strongest relations first and explains each", () => {
    const seed = node("habit tracker", { prefixes: ["habit t"], categories: ["IOS:6013"] });

    const related = relatedTo(seed, [
      node("habit tracker widget", { prefixes: ["habit t"] }),
      node("step counter", { categories: ["IOS:6013"] }),
      node("budget planner"),
    ]);

    expect(related.map((r) => r.term)).not.toContain("budget planner");
    expect(related[0]?.relation.detail).toBeTruthy();
  });

  it("never returns the seed itself", () => {
    const seed = node("habit tracker", { prefixes: ["habit t"] });

    expect(relatedTo(seed, [seed])).toHaveLength(0);
  });
});
