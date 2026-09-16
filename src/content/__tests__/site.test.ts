import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BENEFITS,
  CLIENTS,
  FAQ,
  FEATURE_CARDS,
  FOOTER_NAV,
  HERO,
  HOW_IT_WORKS,
  INTEGRATIONS,
  LOGO_WALL,
  PRICING,
  PRIMARY_NAV,
  SHOWCASES,
  SITE,
  TESTIMONIALS,
} from "@/content/site";

/** Maps a public path to the route file that must exist for it to resolve. */
function routeFileFor(href: string): string | null {
  const [pathOnly] = href.split("#");
  // A bare fragment like "#pricing" targets the current page, so there is no
  // route file to check.
  if (pathOnly === "") return null;
  if (!pathOnly || !pathOnly.startsWith("/")) return null;

  const segments = pathOnly.split("/").filter(Boolean);
  const base = path.join(process.cwd(), "src", "app");

  // Special-cased: served by a route handler outside the marketing group.
  if (pathOnly === "/blog/rss.xml") return path.join(base, "blog", "rss.xml", "route.ts");
  if (segments.length === 0) return path.join(base, "(marketing)", "page.tsx");

  const direct = path.join(base, "(marketing)", ...segments, "page.tsx");
  if (existsSync(direct)) return direct;

  if (segments.length > 1) {
    const parent = segments.slice(0, -1);
    const dynamicSlug = path.join(base, "(marketing)", ...parent, "[slug]", "page.tsx");
    if (existsSync(dynamicSlug)) return dynamicSlug;
  }

  return direct;
}

/** Every destination reachable from the header, dropdown children included. */
const HEADER_LINKS = PRIMARY_NAV.flatMap((item) =>
  item.children ? item.children.map((child) => child.href) : [item.href],
);

describe("navigation", () => {
  it("points every header link at a route that exists", () => {
    for (const href of HEADER_LINKS) {
      const file = routeFileFor(href);
      if (!file) continue;
      expect(existsSync(file), `${href} has no page at ${file}`).toBe(true);
    }
  });

  it("points every footer link at a route that exists", () => {
    for (const column of FOOTER_NAV) {
      for (const link of column.links) {
        const file = routeFileFor(link.href);
        if (!file) continue;
        expect(existsSync(file), `${link.href} has no page at ${file}`).toBe(true);
      }
    }
  });

  it("lists each top-level destination once", () => {
    // Two top-level entries pointing at the same page put one destination in
    // the nav twice, which is what a Resources dropdown linking to /blog next
    // to a Blog link did.
    const topLevel = PRIMARY_NAV.flatMap((item) => (item.href ? [item.href] : []));
    expect(new Set(topLevel).size).toBe(topLevel.length);
  });

  it("gives a dropdown parent children instead of its own destination", () => {
    for (const item of PRIMARY_NAV) {
      if (!item.children) continue;
      expect(item.href, `${item.label} is both a link and a dropdown`).toBeUndefined();
      expect(item.children.length, `${item.label} has an empty dropdown`).toBeGreaterThan(0);
    }
  });

  it("uses unique labels, since the open menu is tracked by label", () => {
    const labels = PRIMARY_NAV.map((item) => item.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("placeholder content", () => {
  // The rule these enforce: sample content is allowed to exist, but it must be
  // marked, because an unmarked invented testimonial on a public page is a
  // fabricated endorsement rather than a layout stand-in.
  it("marks every client while the logo wall is still sample content", () => {
    if (!LOGO_WALL.placeholder) return;
    for (const client of CLIENTS) {
      expect(client.placeholder, `"${client.name}" is on a sample wall but unmarked`).toBe(true);
    }
  });

  it("never puts a real company's mark on the logo wall", () => {
    // Publishing another company's brand claims an endorsement we do not have
    // and uses artwork that is not ours. This catches the tempting shortcut of
    // pasting recognisable names in to make the wall look busier.
    const notOurs = [
      "google",
      "apple",
      "microsoft",
      "adobe",
      "notion",
      "meta",
      "facebook",
      "amazon",
      "netflix",
      "spotify",
      "uber",
      "airbnb",
      "slack",
      "figma",
      "shopify",
      "stripe",
      "canva",
      "duolingo",
      "tiktok",
      "snapchat",
      "app store",
      "play store",
      "google play",
    ];

    for (const client of CLIENTS) {
      const name = client.name.toLowerCase();
      const hit = notOurs.find((brand) => name.includes(brand));
      expect(hit, `"${client.name}" looks like a real brand (${hit})`).toBeUndefined();
    }
  });

  it("gives every client a glyph, since none of them have a real logo file", () => {
    const marks = ["orbit", "prism", "wave", "grid", "spark", "arc"];
    for (const client of CLIENTS) {
      expect(marks, `${client.name} has an unknown mark`).toContain(client.mark);
    }
  });

  it("marks every testimonial whose author is not a real person", () => {
    for (const item of TESTIMONIALS) {
      if (item.author === "Name" || item.role.includes("Company")) {
        expect(item.placeholder, `"${item.author}" is sample copy but unmarked`).toBe(true);
      }
    }
  });

  it("marks every showcase whose company name is invented", () => {
    for (const item of SHOWCASES) {
      if (item.company.toLowerCase().startsWith("sample")) {
        expect(item.placeholder, `${item.slug} is sample copy but unmarked`).toBe(true);
      }
    }
  });

  it("never leaves a real showcase carrying unfilled result figures", () => {
    for (const item of SHOWCASES.filter((s) => !s.placeholder)) {
      for (const result of item.results) {
        expect(result.value, `${item.slug} is published with an empty result`).not.toBe("—");
      }
    }
  });
});

describe("showcases", () => {
  it("uses unique slugs, since the slug is the URL", () => {
    const slugs = SHOWCASES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses URL-safe slugs", () => {
    for (const item of SHOWCASES) {
      expect(item.slug, item.company).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("gives every showcase the fields its page renders", () => {
    for (const item of SHOWCASES) {
      expect(item.summary, item.slug).toBeTruthy();
      expect(item.challenge, item.slug).toBeTruthy();
      expect(item.approach.length, item.slug).toBeGreaterThan(0);
      expect(item.results.length, item.slug).toBeGreaterThan(0);
    }
  });
});

describe("pricing", () => {
  it("marks the tiers while the prices are still examples", () => {
    // A price on a public page is something a visitor plans around. Invented
    // ones must say so until a real number replaces them.
    if (PRICING.tiers.some((tier) => tier.price === "$29")) {
      expect(PRICING.placeholder).toBe(true);
    }
  });

  it("features exactly one tier, so the recommendation is unambiguous", () => {
    expect(PRICING.tiers.filter((tier) => tier.featured)).toHaveLength(1);
  });

  it("gives every tier a price, an audience and something to click", () => {
    for (const tier of PRICING.tiers) {
      expect(tier.price, tier.name).toMatch(/^[^\s]+$/);
      expect(tier.audience, tier.name).toBeTruthy();
      expect(tier.features.length, tier.name).toBeGreaterThan(0);
      expect(tier.cta.href, tier.name).toMatch(/^\//);
    }
  });

  it("uses unique tier names", () => {
    const names = PRICING.tiers.map((tier) => tier.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("hero", () => {
  it("promises only what the deployment can honour", () => {
    // "14-day free trial" and "cancel anytime" imply billing that does not
    // exist yet; anything asserted here has to be true on day one.
    const claims = HERO.assurances.join(" ").toLowerCase();
    expect(claims).not.toMatch(/trial|cancel anytime|money.back/);
  });

  it("has both a headline and a call to action", () => {
    expect(HERO.headline.lead).toBeTruthy();
    expect(HERO.headline.accent).toBeTruthy();
    expect(HERO.primary.href).toMatch(/^\//);
    expect(HERO.secondary.href).toMatch(/^\//);
  });
});

describe("logo wall", () => {
  it("does not claim a customer count it cannot back", () => {
    if (LOGO_WALL.customerCount !== null) {
      expect(LOGO_WALL.placeholder).toBe(false);
    }
  });
});

describe("feature cards", () => {
  it("links every card somewhere real", () => {
    for (const card of FEATURE_CARDS) {
      expect(card.href, card.title).toMatch(/^\//);
      expect(card.body.length, card.title).toBeGreaterThan(30);
    }
  });

  it("uses unique ids", () => {
    const ids = FEATURE_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("copy blocks", () => {
  it("gives every benefit an id, a claim and the mechanism behind it", () => {
    for (const benefit of BENEFITS) {
      expect(benefit.id).toMatch(/^[a-z0-9-]+$/);
      expect(benefit.title).toBeTruthy();
      expect(benefit.body).toBeTruthy();
      // A claim with no stated mechanism is marketing, not documentation.
      expect(benefit.detail, `${benefit.id} claims something with no "how"`).toBeTruthy();
    }
  });

  it("uses unique benefit ids, since they are anchor targets", () => {
    const ids = BENEFITS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("pairs every benefit with an illustration on the benefits page", () => {
    // The benefits page maps each id to the mockup that demonstrates it. A
    // benefit with no entry renders beside empty space, so the map has to keep
    // up with this list rather than falling back to generic decoration.
    const page = readFileSync(
      path.join(process.cwd(), "src", "app", "(marketing)", "benefits", "page.tsx"),
      "utf8",
    );
    const map = page.slice(page.indexOf("const ILLUSTRATIONS"), page.indexOf("export default"));

    for (const benefit of BENEFITS) {
      const key = /^[a-z]+$/.test(benefit.id) ? benefit.id : `"${benefit.id}"`;
      expect(map.includes(`${key}:`), `${benefit.id} has no illustration`).toBe(true);
    }
  });

  it("numbers the steps in order", () => {
    expect(HOW_IT_WORKS.map((s) => s.step)).toEqual(
      HOW_IT_WORKS.map((_, i) => String(i + 1).padStart(2, "0")),
    );
  });

  it("answers every FAQ question", () => {
    for (const item of FAQ) {
      expect(item.q.endsWith("?"), `"${item.q}" is not a question`).toBe(true);
      expect(item.a.length).toBeGreaterThan(40);
    }
  });

  it("lists what each integration provides", () => {
    for (const item of INTEGRATIONS) {
      expect(item.provides, item.name).toBeTruthy();
    }
  });
});

describe("site details", () => {
  it("uses a valid contact email", () => {
    expect(SITE.contact.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });

  it("marks the contact block while it is still an example address", () => {
    if (SITE.contact.email.includes("example.com")) {
      expect(SITE.contact.placeholder).toBe(true);
    }
  });

  it("gives every social link an absolute url", () => {
    for (const item of SITE.social) {
      expect(() => new URL(item.href), item.label).not.toThrow();
    }
  });
});
