/**
 * Related terms and clustering.
 *
 * A keyword corpus is a list until you know which terms belong together.
 * Clustering is what turns 200,000 rows into "here are the twelve things people
 * search for in this space, and the phrasings each one attracts".
 *
 * Everything here is pure and derives from signals the corpus already holds —
 * no extra store requests, no new tables. That constraint is also what makes it
 * explainable: every edge can name the observation that produced it.
 *
 * ## What relates two terms
 *
 * **Shared prefix.** Both terms were returned by the store for the same
 * autocomplete prefix. `KeywordSignal.context` already records which prefix
 * produced each observation, so this is free. Its strength depends entirely on
 * how specific the prefix was: sharing "ha" means almost nothing, sharing
 * "habit t" means the store considers them the same search.
 *
 * **Shared category.** Both terms are used by apps ranking in the same category
 * chart. Topical rather than lexical, so it catches pairs that share no words —
 * "pedometer" and "step counter" have nothing in common as strings.
 *
 * **Shared words.** The weakest and most obvious signal, kept because it
 * reliably collapses the phrasings of one idea.
 *
 * **Shared ranking apps.** The strongest of the four, and the only one that is
 * direct rather than circumstantial: if the same apps come back when you search
 * both terms, the store already treats them as the same search, whatever the
 * words are. `scoreCompetition` fetches those results anyway, so recording the
 * top ten costs nothing.
 */

/** A term and the observations that can relate it to others. */
export type ClusterInput = {
  id: string;
  term: string;
  /** Demand index. Decides which term becomes a cluster's label. */
  demand: number;
  /** Autocomplete prefixes that returned this term. */
  prefixes: string[];
  /** Category charts whose ranked apps use this term. */
  categories: string[];
  /** Store ids of the apps ranking for this term, from its difficulty scan. */
  apps: string[];
};

export type RelationReason = "results" | "prefix" | "category" | "words";

/**
 * How many of the same apps must rank for two terms before they are the same
 * search.
 *
 * Not a Jaccard: two terms sharing three apps out of a ten-app top set score
 * 3/17 by Jaccard, which reads as unrelated when in fact three of the same
 * apps ranking for both is strong evidence. Counting against a fixed target is
 * how this is done in practice, and five is the point past which the two result
 * sets are more alike than different.
 */
export const SERP_TARGET = 5;

export type Relation = {
  score: number;
  reason: RelationReason;
  /** Human-readable, e.g. `both completed from "habit t"`. */
  detail: string;
};

/**
 * How much a shared prefix says.
 *
 * Two terms sharing "ha" share a coincidence of spelling; two terms sharing
 * "habit tr" are the same search wearing different words. Scaling by length is
 * the cheapest way to encode that, and it matters more than it looks — without
 * it, every term beginning with the same two letters clusters together and the
 * output is an alphabet, not a set of topics.
 *
 * The curve is deliberately steep enough that a **short prefix cannot group two
 * terms on its own**. Four characters used to clear the bar, which put
 * "backyard baseball", "background eraser", "backrooms 2" and "backup sms" in
 * one cluster of twelve — all of them merely words beginning "back". A shared
 * stem is real information but weak information, so it now needs either length
 * or a second signal agreeing with it. That costs some true groupings, which is
 * the right way round: a missing cluster is a gap, a wrong one is a lie.
 */
export function prefixWeight(prefix: string): number {
  const length = prefix.trim().length;
  return Math.max(0.05, Math.min(1, (length - 2) / 5));
}

/** Jaccard similarity over words. */
export function tokenOverlap(a: string, b: string): number {
  const left = new Set(a.split(" ").filter(Boolean));
  const right = new Set(b.split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;

  return shared / (left.size + right.size - shared);
}

/**
 * Agreement between two terms' ranking apps, 0-1.
 *
 * Empty on either side means "not scored yet", which is not the same as "no
 * overlap" — a term whose difficulty has never been measured has no result set
 * to compare, and returning 0 for it is the honest answer rather than a claim
 * that the two are unrelated.
 */
export function serpOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  return Math.min(1, sharedItems(a, b).length / SERP_TARGET);
}

function sharedItems(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((item) => set.has(item));
}

/**
 * How related two terms are, and why.
 *
 * The strongest single piece of evidence sets the score, rather than a sum of
 * all three. A sum lets three weak coincidences masquerade as one strong
 * relationship, and it also destroys the explanation — "0.62" says nothing,
 * while `both completed from "habit t"` is something a person can check.
 *
 * Corroboration still counts for something, so each additional signal that
 * clears a floor of its own adds a small amount. It cannot promote a pair that
 * had no real evidence to begin with.
 */
export function relatedness(a: ClusterInput, b: ClusterInput): Relation {
  if (a.id === b.id) return { score: 1, reason: "results", detail: "the same term" };

  const prefixes = sharedItems(a.prefixes, b.prefixes);
  const bestPrefix = prefixes.reduce(
    (best, prefix) => (prefixWeight(prefix) > prefixWeight(best) ? prefix : best),
    "",
  );
  const prefixScore = bestPrefix ? prefixWeight(bestPrefix) : 0;

  // Jaccard, not a count.
  //
  // Counting shared categories put "google" in a cluster with "secure vpn",
  // "word" and "amazon": brand terms appear in the charts of many categories,
  // so any one of those categories is a coincidence rather than a topic. What
  // matters is the share — two terms that each appear in one category and share
  // it are the same subject, while one category out of eight is noise.
  const categories = sharedItems(a.categories, b.categories);
  const categoryUnion = new Set([...a.categories, ...b.categories]).size;
  const categoryScore = categoryUnion === 0 ? 0 : 0.8 * (categories.length / categoryUnion);

  const wordScore = tokenOverlap(a.term, b.term);

  const sharedApps = sharedItems(a.apps, b.apps);
  const serpScore = serpOverlap(a.apps, b.apps);

  const candidates: Relation[] = [
    {
      score: serpScore,
      reason: "results",
      detail:
        sharedApps.length > 0
          ? `${sharedApps.length} of the same apps rank for both`
          : "",
    },
    {
      score: prefixScore,
      reason: "prefix",
      detail: bestPrefix ? `both completed from "${bestPrefix}"` : "",
    },
    {
      score: categoryScore,
      reason: "category",
      detail: categories.length > 0 ? `both used by apps ranking in ${categories[0]}` : "",
    },
    { score: wordScore, reason: "words", detail: "share wording" },
  ];

  const best = candidates.reduce((top, candidate) => (candidate.score > top.score ? candidate : top));
  if (best.score === 0) return { score: 0, reason: "words", detail: "no shared evidence" };

  const corroborating = candidates.filter((c) => c !== best && c.score >= 0.3).length;

  return {
    ...best,
    score: Math.min(1, best.score + corroborating * 0.1),
  };
}

export type Cluster = {
  /** The highest-demand term in the group. */
  label: string;
  members: { id: string; term: string; demand: number; relation: Relation | null }[];
};

/**
 * Group terms into clusters, each built around its strongest member.
 *
 * Greedy star clustering rather than connected components. Components chain —
 * A relates to B, B to C, C to D, and the result is one enormous cluster whose
 * ends have nothing to do with each other, which is the classic way keyword
 * clustering produces a single bucket called "everything". A star cluster is
 * every term that relates *to the same centre*, so it stays coherent and it has
 * a natural name: the centre.
 *
 * Centres are chosen by demand, so the label of a cluster is the term most
 * people actually search.
 */
export function cluster(inputs: ClusterInput[], threshold = 0.45): Cluster[] {
  const remaining = [...inputs].sort((a, b) => b.demand - a.demand);
  const clusters: Cluster[] = [];
  const taken = new Set<string>();

  for (const centre of remaining) {
    if (taken.has(centre.id)) continue;
    taken.add(centre.id);

    const members: Cluster["members"] = [
      { id: centre.id, term: centre.term, demand: centre.demand, relation: null },
    ];

    for (const candidate of remaining) {
      if (taken.has(candidate.id)) continue;

      const relation = relatedness(centre, candidate);
      if (relation.score < threshold) continue;

      taken.add(candidate.id);
      members.push({
        id: candidate.id,
        term: candidate.term,
        demand: candidate.demand,
        relation,
      });
    }

    clusters.push({ label: centre.term, members });
  }

  // Biggest first: a cluster of one is a term nothing else relates to, which is
  // worth showing but not worth showing first.
  return clusters.sort((a, b) => b.members.length - a.members.length);
}

/**
 * The terms most related to one seed, strongest first.
 *
 * Separate from `cluster` because it answers a different question: not "how
 * does this set divide up" but "what else should I look at, given this term".
 */
export function relatedTo(
  seed: ClusterInput,
  candidates: ClusterInput[],
  options: { limit?: number; threshold?: number } = {},
): { id: string; term: string; demand: number; relation: Relation }[] {
  const threshold = options.threshold ?? 0.3;

  return candidates
    .filter((candidate) => candidate.id !== seed.id)
    .map((candidate) => ({
      id: candidate.id,
      term: candidate.term,
      demand: candidate.demand,
      relation: relatedness(seed, candidate),
    }))
    .filter((row) => row.relation.score >= threshold)
    .sort((a, b) => b.relation.score - a.relation.score || b.demand - a.demand)
    .slice(0, options.limit ?? 12);
}
