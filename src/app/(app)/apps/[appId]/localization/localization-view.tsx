"use client";

import { format } from "date-fns";
import { Check, Copy, Globe, Layers, Minus, Plus, Sparkles, Star, Trash2, TriangleAlert, Zap } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { cn, storefrontKey, STOREFRONTS } from "@aso/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { api } from "@/trpc/react";

export function LocalizationView({ appId }: { appId: string }) {
  const utils = api.useUtils();

  const coverage = api.apps.coverage.useQuery({ appId });
  const locales = api.apps.locales.useQuery({ appId });
  const crossMatrix = api.crossLocale.matrix.useQuery({ appId, country: "us" });

  const [pending, setPending] = React.useState("");
  const [characterBankInput, setCharacterBankInput] = React.useState<Record<string, string>>({
    "en-US": "habit tracker, streak counter, daily routine",
    "es-MX": "seguimiento de habitos, metas diarias, productividad",
    "ar-SA": "تتبع العادات, اهداف يومية, روتين",
    "fr-CA": "suivi des habitudes, routine quotidienne",
  });

  const analyzeOverlap = api.crossLocale.analyzeKeywords.useMutation({
    onSuccess: (data) => {
      toast.success(`Analysis complete: ${data.uniqueTerms.length} unique keywords identified across locales!`);
    },
    onError: (err) => toast.error(err.message),
  });

  const invalidate = async () => {
    await Promise.all([
      utils.apps.coverage.invalidate({ appId }),
      utils.apps.locales.invalidate({ appId }),
      utils.crossLocale.matrix.invalidate({ appId }),
    ]);
  };

  const addLocale = api.apps.addLocale.useMutation({
    onSuccess: async () => {
      toast.success("Storefront added — a listing capture is queued");
      setPending("");
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const setPrimary = api.apps.setPrimaryLocale.useMutation({
    onSuccess: async () => {
      toast.success("Primary storefront updated");
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const removeLocale = api.apps.removeLocale.useMutation({
    onSuccess: async () => {
      toast.success("Storefront removed. Captured history is kept.");
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const generate = api.ai.metadataVariants.useMutation({
    onSuccess: (result) =>
      toast.success(
        `${result.variants.length} localized variants generated${
          result.rejected ? ` — ${result.rejected} rejected for length` : ""
        }`,
      ),
    onError: (error) => toast.error(error.message),
  });

  const tracked = new Set(
    (locales.data ?? []).map((l) => storefrontKey(l.country, l.locale)),
  );
  const available = STOREFRONTS.filter((s) => !tracked.has(storefrontKey(s.country, s.locale)));

  const untranslated = (coverage.data ?? []).filter(
    (entry) => !entry.isPrimary && entry.fields.some((f) => f.sameAsPrimary),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Apple Cross-Localization Secret Weapon Matrix */}
      <Card className="border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_4%,transparent)]">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-[var(--accent)]">
                <Zap className="size-4" /> Apple Cross-Localization Multiplier Matrix (US Storefront)
              </CardTitle>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Apple indexes secondary languages into the US search algorithm! Localizing these 9 locales multiplies your 100-character keyword field into <strong>900 characters</strong> of indexing power.
              </p>
            </div>
            {crossMatrix.data ? (
              <Badge tone="accent">
                {crossMatrix.data.multiplier}x Keyword Space Multiplier ({crossMatrix.data.totalKeywordCapacity} chars)
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)]">
                  <th className="px-4 py-2 font-medium">Indexed Locale</th>
                  <th className="px-3 py-2 font-medium">Language</th>
                  <th className="px-3 py-2 font-medium">Indexing Role</th>
                  <th className="px-3 py-2 font-medium">Keyword Budget</th>
                  <th className="px-4 py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {crossMatrix.data?.locales.map((loc) => (
                  <tr key={loc.locale} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold">
                      {loc.locale}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-medium">
                      {loc.language}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">
                      {loc.description}
                    </td>
                    <td className="tabular px-3 py-2.5 text-xs font-semibold text-[var(--status-good)]">
                      100 Chars Keywords + 30 Chars Subtitle
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs">
                      {loc.isTracked ? (
                        <Badge tone="good">Tracked</Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            addLocale.mutate({
                              appId,
                              country: "us",
                              locale: loc.locale,
                            });
                          }}
                        >
                          <Plus /> Activate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Cross-Locale Character Bank Calculator */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Layers className="size-4" /> Multi-Locale Character Bank & Keyword Deduplicator
            </CardTitle>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                const map: Record<string, string[]> = {};
                for (const [loc, text] of Object.entries(characterBankInput)) {
                  map[loc] = text.split(",").map((s) => s.trim()).filter(Boolean);
                }
                analyzeOverlap.mutate({
                  appId,
                  country: "us",
                  keywordsByLocale: map,
                });
              }}
              disabled={analyzeOverlap.isPending}
            >
              <Sparkles /> {analyzeOverlap.isPending ? "Calculating..." : "Check Overlap & Wasted Chars"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-[var(--text-secondary)]">
            Enter comma-separated keywords for each indexed locale below. Duplicate terms across secondary locales waste character budget.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {["en-US", "es-MX", "ar-SA", "fr-CA"].map((loc) => (
              <div key={loc} className="flex flex-col gap-1 rounded-md border border-[var(--border)] p-3">
                <Label htmlFor={`kb-${loc}`} className="text-xs font-semibold uppercase">{loc} Keyword Field</Label>
                <Input
                  id={`kb-${loc}`}
                  value={characterBankInput[loc] ?? ""}
                  onChange={(e) =>
                    setCharacterBankInput({ ...characterBankInput, [loc]: e.target.value })
                  }
                  placeholder="e.g. term1, term2, term3"
                />
              </div>
            ))}
          </div>

          {analyzeOverlap.data ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] p-4 text-xs">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-[var(--text-secondary)]">Total Keywords</p>
                  <p className="text-sm font-semibold">{analyzeOverlap.data.totalTerms}</p>
                </div>
                <div>
                  <p className="text-[var(--text-secondary)]">Unique Search Keywords</p>
                  <p className="text-sm font-semibold text-[var(--status-good)]">{analyzeOverlap.data.uniqueTerms.length}</p>
                </div>
                <div>
                  <p className="text-[var(--text-secondary)]">Wasted Characters</p>
                  <p className="text-sm font-semibold text-[var(--status-warning)]">{analyzeOverlap.data.wastedCharacters} Chars</p>
                </div>
                <div>
                  <p className="text-[var(--text-secondary)]">Efficiency Score</p>
                  <p className="text-sm font-semibold">{analyzeOverlap.data.efficiencyScore} / 100</p>
                </div>
              </div>

              {analyzeOverlap.data.recommendations.length > 0 ? (
                <div className="mt-3 flex flex-col gap-1 border-t border-[var(--border)] pt-3">
                  {analyzeOverlap.data.recommendations.map((rec, i) => (
                    <p key={i} className="text-[var(--text-primary)] font-medium">• {rec}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Storefronts Management */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="size-4" aria-hidden /> Storefront Tracking
            </CardTitle>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Both stores serve different text per country. An app that ranks in the US can be invisible in Brazil purely because nobody localized the keyword field.
            </p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const storefront = STOREFRONTS.find(
                (s) => storefrontKey(s.country, s.locale) === pending,
              );
              if (storefront) {
                addLocale.mutate({
                  appId,
                  country: storefront.country,
                  locale: storefront.locale,
                });
              }
            }}
          >
            <div className="flex min-w-56 flex-col gap-1.5">
              <Label htmlFor="storefront">Add a Storefront</Label>
              <Select
                id="storefront"
                value={pending}
                onChange={(e) => setPending(e.target.value)}
              >
                <option value="">Select...</option>
                {available.map((s) => (
                  <option key={storefrontKey(s.country, s.locale)} value={storefrontKey(s.country, s.locale)}>
                    {s.label} · {s.language}
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="primary" type="submit" disabled={!pending || addLocale.isPending}>
              <Plus /> Track
            </Button>
          </form>

          {untranslated.length > 0 ? (
            <p className="flex items-start gap-2 rounded-md border border-[var(--status-warning)] bg-[color-mix(in_oklab,var(--status-warning)_12%,transparent)] p-2.5 text-xs">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                {untranslated.length === 1
                  ? "1 storefront still serves"
                  : `${untranslated.length} storefronts still serve`}{" "}
                text identical to the primary. Identical copy in a different-language market means the listing was never actually localized.
              </span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      {coverage.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Coverage & Metadata Audit</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)]">
                    <th className="px-4 py-2 font-medium">Storefront</th>
                    <th className="px-2 py-2 text-right font-medium">Score</th>
                    {coverage.data?.[0]?.fields.map((field) => (
                      <th key={field.field} className="px-2 py-2 text-center font-medium">
                        {field.label}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right font-medium">Tracked</th>
                    <th className="px-2 py-2 text-right font-medium">Ranking</th>
                    <th className="px-2 py-2 font-medium">Captured</th>
                    <th className="w-24 px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {coverage.data?.map((entry) => {
                    const localeRow = locales.data?.find(
                      (l) => l.country === entry.country && l.locale === entry.locale,
                    );

                    return (
                      <tr
                        key={`${entry.country}:${entry.locale}`}
                        className="border-b border-[var(--border)] last:border-0"
                      >
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{entry.label}</span>
                            {entry.isPrimary ? <Badge tone="accent">Primary</Badge> : null}
                          </div>
                        </td>

                        <td className="tabular px-2 py-2 text-right">
                          {entry.score === null ? (
                            <span className="text-[var(--text-muted)]">-</span>
                          ) : !entry.isLocalized ? (
                            <span
                              className="inline-flex items-center gap-1"
                              title={`Scores ${entry.score}, but untranslated`}
                            >
                              <Badge tone="critical">Not localized</Badge>
                            </span>
                          ) : (
                            <Badge
                              tone={
                                entry.score >= 75 ? "good" : entry.score >= 45 ? "warning" : "critical"
                              }
                            >
                              {entry.score}
                            </Badge>
                          )}
                        </td>

                        {entry.fields.map((field) => (
                          <td key={field.field} className="px-2 py-2 text-center">
                            <FieldCell field={field} isPrimary={entry.isPrimary} />
                          </td>
                        ))}

                        <td className="tabular px-2 py-2 text-right">{entry.keywordCount}</td>
                        <td className="tabular px-2 py-2 text-right">{entry.rankedCount}</td>
                        <td className="px-2 py-2 text-xs text-[var(--text-muted)]">
                          {entry.capturedAt ? format(entry.capturedAt, "d MMM") : "never"}
                        </td>

                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Generate ${entry.label} metadata`}
                              onClick={() =>
                                generate.mutate({
                                  appId,
                                  country: entry.country,
                                  locale: entry.locale,
                                  count: 2,
                                })
                              }
                              disabled={generate.isPending}
                            >
                              <Sparkles />
                            </Button>
                            {!entry.isPrimary && localeRow ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Make ${entry.label} primary`}
                                  onClick={() =>
                                    setPrimary.mutate({ appId, localeId: localeRow.id })
                                  }
                                >
                                  <Star />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Remove ${entry.label}`}
                                  onClick={() =>
                                    removeLocale.mutate({ appId, localeId: localeRow.id })
                                  }
                                >
                                  <Trash2 />
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FieldCell({
  field,
  isPrimary,
}: {
  field: { filled: boolean; chars: number; limit: number; sameAsPrimary: boolean };
  isPrimary: boolean;
}) {
  if (!field.filled) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
        <Minus className="size-3" aria-hidden /> -
      </span>
    );
  }

  if (field.sameAsPrimary && !isPrimary) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--status-warning)]">
        <TriangleAlert className="size-3" aria-hidden /> same
      </span>
    );
  }

  const usage = field.limit ? field.chars / field.limit : 0;

  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-1 text-xs",
        usage < 0.6 ? "text-[var(--text-secondary)]" : "text-[var(--status-good)]",
      )}
    >
      <Check className="size-3" aria-hidden />
      {field.chars}/{field.limit}
    </span>
  );
}
