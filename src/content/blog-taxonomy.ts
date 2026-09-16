/**
 * The blog's topic clusters.
 *
 * Search engines reward a site that demonstrably covers a subject rather than
 * one that scatters isolated posts. The shape that produces is a **pillar and
 * cluster**: one comprehensive page per category that targets the broad,
 * competitive term, surrounded by focused posts that each target a narrower
 * question and link back to the pillar. The pillar earns authority from the
 * cluster; the cluster earns traffic the pillar is too broad to rank for.
 *
 * Categories are a curated list rather than free-form frontmatter for the same
 * reason the corpus normalises its terms: "keyword-research" and "Keyword
 * Research" as two categories would split the cluster in half and halve the
 * internal linking that makes it work. An unknown category fails the build.
 *
 * Tags stay free-form. They cut across categories — a post can be tagged
 * `ios` and `measurement` while living in one category — and they are a
 * browsing aid, not the SEO structure.
 */

export type BlogCategory = {
  slug: string;
  name: string;
  /** Shown on the category page and used as its meta description. */
  description: string;
  /**
   * The broad term the pillar page targets. Recorded so the intent behind a
   * cluster is legible later, when someone is deciding whether a new post
   * belongs here or somewhere else.
   */
  targetTerm: string;
  /** Slug of the pillar post. Every other post in the category links to it. */
  pillar: string;
};

export const BLOG_CATEGORIES: BlogCategory[] = [
  {
    slug: "keyword-research",
    name: "Keyword research",
    description:
      "Finding the terms worth ranking for, judging how contested they are, and deciding which ones to spend a metadata slot on.",
    targetTerm: "app store keyword research",
    pillar: "app-store-keyword-research",
  },
  {
    slug: "rank-tracking",
    name: "Rank tracking",
    description:
      "Measuring where an app actually sits, what makes a rank move, and how to tell a real change from a measurement artefact.",
    targetTerm: "app store rank tracking",
    pillar: "how-app-store-rankings-work",
  },
  {
    slug: "store-listing",
    name: "Store listing",
    description:
      "Titles, subtitles, screenshots and descriptions — the fields that decide whether an impression becomes an install.",
    targetTerm: "app store listing optimization",
    pillar: "app-store-listing-optimization",
  },
  {
    slug: "analytics",
    name: "Analytics",
    description:
      "Attribution, revenue reconciliation and the reporting differences between Apple and Google that quietly corrupt a dashboard.",
    targetTerm: "app store analytics",
    pillar: "app-store-analytics-guide",
  },
  {
    slug: "reviews",
    name: "Reviews and ratings",
    description:
      "How ratings feed back into ranking and conversion, and what to do about reviews at a volume one person cannot read.",
    targetTerm: "app store reviews strategy",
    pillar: "app-reviews-and-ratings-guide",
  },
];

export const CATEGORY_SLUGS = BLOG_CATEGORIES.map((category) => category.slug);

export function findCategory(slug: string): BlogCategory | undefined {
  return BLOG_CATEGORIES.find((category) => category.slug === slug);
}

/** True when a post is the comprehensive page its category is built around. */
export function isPillar(categorySlug: string, postSlug: string): boolean {
  return findCategory(categorySlug)?.pillar === postSlug;
}
