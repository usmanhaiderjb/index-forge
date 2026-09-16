# Product roadmap — feature gaps

`IMPROVEMENTS.md` covers engineering health. This covers what the product does
not yet do, ranked by how much it would change a customer's decisions.

Audited against the current surface: 15 tRPC routers, 9 AI capabilities, 28
metric keys, 34 models, and job handlers for sync, insights, digests and
schedules. The breadth is already unusual for this stage — keywords with SERP
and competitor ranks, review classification and replies, screenshot analysis,
metadata change impact, multi-locale, chart ranks, alerts, digests, exports and
a public REST API.

So these are gaps, not a list of everything an ASO tool needs.

---

## 1. Store listing experiments — the biggest gap

**There is no experiment model.** `grep -i variant prisma/schema.prisma` returns
one hit, and it is about AI metadata suggestions, not A/B tests.

This matters more than anything else on the list because **running an experiment
is the core ASO workflow.** Google Play has Store Listing Experiments and Apple
has Product Page Optimization. The loop a practitioner actually runs is: form a
hypothesis about the icon or first screenshot, run a 50/50 test, measure lift,
keep the winner.

The product currently supports the first half of that loop well —
`MetadataSuggestion` proposes changes, `impact.ts` measures what happened after
one. But **observational impact is not the same as an experiment.** If installs
rose the week you changed the icon, `impact.ts` will say so, and it cannot tell
you whether the icon did it or whether a competitor went down, a holiday
happened, or you started a campaign.

What to build:

- `Experiment` and `ExperimentVariant` models — platform, hypothesis, variants,
  traffic split, start/stop, status.
- Read results from Play Console's experiment API and ASC's PPO API.
- A results view that reports lift **with a confidence interval**, and refuses
  to declare a winner before significance. Given how carefully this codebase
  refuses to present derived numbers as measured, calling a 3% difference on 200
  installs a "win" would be out of character.
- Feed winners back into `MetadataSuggestion` so the AI learns what actually won
  for this app rather than what it guesses will win.

**Effort:** a week. **Why first:** it closes the only loop that turns the
product from a dashboard into a tool.

---

## 2. Traffic-source breakdown — ✅ built

**Shipped.** `metrics.funnel` splits store traffic into search / browse /
referral / other under the `source=` dimension, the Play Console connector emits
it, and `TrafficFunnel` renders the funnel with per-source conversion. See
HANDOVER §5 for the three arithmetic rules it has to obey.

**Both stores.** Play Console reads the monthly traffic-source CSV; App Store
Connect goes through the Analytics Reports API — asynchronous, four hops, gzipped
TSV behind pre-signed URLs. Apple takes up to 48 hours to provision a new
request, so a fresh connection is empty at first and the UI says why.

Unverified against a live Apple account: `npm run smoke:asc-analytics` covers
the traversal and mapping against a stub, but not that Apple's real column names
match the aliases used.

The original case for building it, kept because it explains the design:

Both Play Console and App Store Connect expose acquisition channel, and this is
the single most actionable split in ASO, because it tells you *which lever to
pull*:

| Symptom | What it means | What you change |
| --- | --- | --- |
| Search impressions low | Not ranking for enough terms | Title, subtitle, keyword field |
| Search conversion low | Ranking, but the listing does not convince | Screenshots, first impression |
| Browse conversion low | Featured or category traffic bouncing | Icon, category fit |
| Referral conversion low | Campaign traffic mismatched | Landing expectations, creative |

Today `CONVERSION_RATE` is one blended number. A blended 23% could be excellent
search plus terrible browse, or the reverse, and the product cannot tell you
which — so it cannot tell you what to fix.

The infrastructure is already there: `dimension` supports arbitrary keys, the
precedence and aggregation layers are dimension-aware, and `IMPRESSIONS` and
`STORE_PAGE_VIEWS` both exist as metric keys. This is mostly connector work plus
a funnel view.

**Effort spent:** about a day and a half for both stores.

---

## 3. Apple Search Ads → organic keyword bridge

You already have the Apple Search Ads connector, and it is currently used only
for spend and paid installs.

**ASA search-term reports are the only real source of App Store search volume
and conversion data.** Apple publishes nothing publicly; every competitor's
"search volume" for iOS is an estimate. If a customer runs even a small ASA
campaign, their own search-term report tells you — with real numbers — which
terms actually convert for their app.

Turning that into organic targets is a genuinely differentiated feature that
nobody can copy without the same connector:

- Import search terms with impressions, taps, conversion rate.
- Flag terms converting well in paid that the app ranks poorly for organically —
  those are the highest-confidence organic targets that exist.
- Flag the reverse: terms ranking #1 organically that you are also paying for.

That last point is its own feature — see below.

**Effort:** three to four days. Most of the connector work is done.

---

## 4. Paid cannibalization

You have `ORGANIC_INSTALLS` (derived), `PAID_INSTALLS`, `SPEND` and `CPI`.

The question every app running Apple Search Ads on its own brand term should ask
— *am I paying for installs I would have got for free?* — is answerable with the
data already in the schema, and no mainstream tool answers it well.

A view that shows spend on terms where the app already ranks #1 organically, and
estimates the incremental installs that spend actually bought, would pay for the
subscription on its own.

**Effort:** two days on top of item 3.

---

## 5. Per-locale keyword research

`AppLocale` exists and multi-locale rank tracking works. What is missing is the
*workflow*: researching keywords per storefront and generating localized
metadata.

Most apps ship English metadata to 40 storefronts and leave the largest
untouched ASO lever in the product. The AI engine already has
`generateKeywordStrategy` and `generateMetadataVariants` — they need to run
per-locale with locale-specific keyword data, and the output needs to be
translation-aware rather than literal (the highest-volume Japanese term for a
habit tracker is not the translation of "habit tracker").

**Effort:** three to four days.

---

## 6. Release correlation

`impact.ts` tracks what happened after a *metadata* change. Extend the same
machinery to app *versions*.

You already store `CRASH_FREE_USERS`, classified reviews with topics, and
`StoreListing` history. "Crash-free users fell to 97.2% and one-star reviews
mentioning `crash` tripled after 3.2.1" is a sentence the product has every
input to write and currently does not.

**Effort:** two days — largely reusing `impact.ts`.

---

## 7. Competitor change alerts

`Competitor` and `CompetitorSnapshot` exist, and snapshots are taken. Alerts are
metric-threshold based.

Alert on competitor *events*: they changed their title, icon or price; they
entered the top 10 for a keyword you track; their rating dropped below yours.
The snapshots to diff are already being collected.

**Effort:** two days.

---

## 8. Be explicit about estimated vs measured keyword volume

The built-in provider uses public iTunes and Play endpoints. **Neither exposes
real search volume** — so any volume number the product shows is an estimate,
however it is derived.

This codebase already refuses to present derived numbers as measured: organic
installs are labelled `Derived`, the provenance panel names every source, and
`hasData` is a required prop on stat tiles. Keyword volume should get the same
treatment — labelled as estimated, with the method stated, and shown as measured
only when it comes from a customer's own ASA data (item 3).

Competitors are vague about this. Being explicit is consistent with the product's
existing character and is a defensible sales position rather than a weakness.

**Effort:** a day.

---

## What not to build yet

**More AI surface.** There are already nine AI capabilities and **none has run
against the real API** — the Anthropic account had no credits. Adding a tenth
before any one is proven adds unverified surface, not value. Prove
`generateRecommendations` end to end first.

**More integrations.** Six connectors exist and none has touched a live account.
Breadth is not the constraint; proof is.

**A free tier.** Every sync costs scraping and API budget. Until the unit cost
per tracked app is measured, a free tier is an unbounded liability.

---

## Suggested order

1. ~~Traffic-source breakdown (§2)~~ — done for both stores.
2. **Store listing experiments** (§1) — the loop that makes it a tool.
3. **ASA keyword bridge + cannibalization** (§3, §4) — the differentiator
   nobody without that connector can copy.

Items 5 through 8 are all worth doing and none of them changes the product's
shape, so they can be scheduled around customer demand rather than in a fixed
order.
