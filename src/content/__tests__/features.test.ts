import { describe, expect, it } from "vitest";

import {
  FEATURES,
  getAllFeatureSlugs,
  getFeatureBySlug,
} from "@/content/features";
import { PRIMARY_NAV } from "@/content/site";

describe("features content", () => {
  it("defines all core feature pages", () => {
    expect(FEATURES.length).toBeGreaterThanOrEqual(7);
  });

  it("uses unique, URL-safe slugs", () => {
    const slugs = getAllFeatureSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);

    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("retrieves features by slug correctly", () => {
    for (const feature of FEATURES) {
      const found = getFeatureBySlug(feature.slug);
      expect(found).toBeDefined();
      expect(found?.slug).toBe(feature.slug);
    }
    expect(getFeatureBySlug("non-existent-slug")).toBeUndefined();
  });

  it("gives every feature comprehensive SEO metadata", () => {
    for (const feature of FEATURES) {
      expect(feature.navTitle.length, feature.slug).toBeGreaterThan(3);
      expect(feature.metaTitle.length, feature.slug).toBeGreaterThan(15);
      expect(feature.metaDescription.length, feature.slug).toBeGreaterThan(50);
      expect(feature.keywords.length, feature.slug).toBeGreaterThanOrEqual(3);
      expect(feature.eyebrow, feature.slug).toBeTruthy();
      expect(feature.heroHeadline.lead, feature.slug).toBeTruthy();
      expect(feature.heroHeadline.accent, feature.slug).toBeTruthy();
      expect(feature.heroSubheadline.length, feature.slug).toBeGreaterThan(30);
      expect(feature.summary.length, feature.slug).toBeGreaterThan(50);
    }
  });

  it("pairs every feature with at least 3 metrics and a valid mockupId", () => {
    const validMockups = [
      "keywords",
      "competitors",
      "ai",
      "push",
      "reviews",
      "precedence",
      "organic",
      "dashboard",
    ];

    for (const feature of FEATURES) {
      expect(validMockups, `${feature.slug} has unknown mockupId`).toContain(feature.mockupId);
      expect(feature.metrics.length, `${feature.slug} needs metrics`).toBeGreaterThanOrEqual(3);

      for (const metric of feature.metrics) {
        expect(metric.label, feature.slug).toBeTruthy();
        expect(metric.value, feature.slug).toBeTruthy();
        expect(metric.description, feature.slug).toBeTruthy();
      }
    }
  });

  it("provides detailed capabilities with technical explanations", () => {
    for (const feature of FEATURES) {
      expect(feature.capabilitiesHeading, feature.slug).toBeTruthy();
      expect(feature.capabilities.length, feature.slug).toBeGreaterThanOrEqual(3);

      for (const cap of feature.capabilities) {
        expect(cap.title, feature.slug).toBeTruthy();
        expect(cap.description.length, feature.slug).toBeGreaterThan(20);
        expect(cap.detail.length, feature.slug).toBeGreaterThan(20);
      }
    }
  });

  it("provides ordered steps for how it works", () => {
    for (const feature of FEATURES) {
      expect(feature.howItWorks.length, feature.slug).toBeGreaterThanOrEqual(3);

      const steps = feature.howItWorks.map((s) => s.step);
      const expectedSteps = feature.howItWorks.map((_, i) => String(i + 1).padStart(2, "0"));
      expect(steps, `${feature.slug} step numbering`).toEqual(expectedSteps);

      for (const step of feature.howItWorks) {
        expect(step.title, feature.slug).toBeTruthy();
        expect(step.body.length, feature.slug).toBeGreaterThan(20);
      }
    }
  });

  it("provides why legacy tools fail comparisons", () => {
    for (const feature of FEATURES) {
      expect(feature.whyLegacyFails.length, feature.slug).toBeGreaterThanOrEqual(3);

      for (const comp of feature.whyLegacyFails) {
        expect(comp.legacy.length, feature.slug).toBeGreaterThan(15);
        expect(comp.indexForge.length, feature.slug).toBeGreaterThan(15);
      }
    }
  });

  it("answers every FAQ question thoroughly", () => {
    for (const feature of FEATURES) {
      expect(feature.faqs.length, feature.slug).toBeGreaterThanOrEqual(3);

      for (const faq of feature.faqs) {
        expect(faq.q.endsWith("?"), `"${faq.q}" in ${feature.slug} is not a question`).toBe(true);
        expect(faq.a.length, `FAQ in ${feature.slug}`).toBeGreaterThan(30);
      }
    }
  });

  it("aligns header primary navigation with all feature slugs", () => {
    const featureNav = PRIMARY_NAV.find((item) => item.label === "Features");
    expect(featureNav?.children).toBeDefined();

    const headerFeatureSlugs = (featureNav?.children ?? []).map((child) =>
      child.href.replace(/^\/features\//, ""),
    );

    for (const feature of FEATURES) {
      expect(headerFeatureSlugs, `Feature ${feature.slug} should be in header nav`).toContain(
        feature.slug,
      );
    }
  });
});
