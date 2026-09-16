import "server-only";

import { env } from "@/env";
import { builtinAsoProvider } from "@/server/aso/builtin";
import type { AsoProvider } from "@/server/aso/types";

/**
 * Paid providers implement the same interface. They are resolved lazily so a
 * deployment without their keys never loads them.
 */
async function loadPaidProvider(): Promise<AsoProvider | null> {
  if (env.ASO_PROVIDER === "apptweak" && env.APPTWEAK_API_KEY) {
    const { apptweakProvider } = await import("@/server/aso/apptweak");
    return apptweakProvider;
  }
  return null;
}

let cached: AsoProvider | null = null;

export async function getAsoProvider(): Promise<AsoProvider> {
  if (cached) return cached;
  cached = (await loadPaidProvider()) ?? builtinAsoProvider;
  return cached;
}

/** Keyword difficulty and popularity combined into a single ranking score. */
export function opportunityScore(popularity?: number | null, difficulty?: number | null): number {
  const p = popularity ?? 0;
  const d = difficulty ?? 50;
  // A term is worth chasing when demand is high and the field is weak.
  return Math.round(Math.max(0, Math.min(100, p * (1 - d / 130))));
}
