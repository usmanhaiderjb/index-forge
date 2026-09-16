# Trends

Finding categories and niches where demand and supply are both moving — the
shape of a market that is opening rather than one already settled.

Split from [Gap Finder](./GAP-FINDER.md), which answers *what to build* from
review text. This answers *where to look* from time series. They are separate
features because they run on different data and become useful at different
times: everything here needs weeks of observation before it can say anything,
and the Gap Finder does not.

---

## 1. The question

Every other tool in this product answers *"how is my app doing?"*. This one
answers a question asked before an app exists:

> **Where is a new app worth building right now?**

The signal a founder is looking for is a niche where users are arriving faster
than developers are serving them. That has two halves, and both must be
measured:

- **Demand rising** — more people searching for the thing
- **Supply rising** — more developers shipping apps for it

Both rising together is a market waking up. Demand rising while supply stays
flat is the rarer and better case: an unserved gap. Supply rising while demand
is flat is a category filling up, which is the signal to stay away — and it is
the one most tools never show, because it is the one nobody wants to hear.

---

## 2. What can actually be observed

The same discipline as `KEYWORD-DATABASE.md`: name the sources before designing
anything on top of them, because the honest limits shape the product.

### Available

| Signal | Source | Quality |
| --- | --- | --- |
| **Rating count over time** | both stores, per app | the best install proxy available |
| **Search result count over time** | both stores, per term | direct supply measure |
| **Keyword demand index over time** | our own corpus | direct demand measure |
| **Release date** | both stores, per app | identifies genuinely new apps |
| **Chart position over time** | both stores, per category | download velocity, already crawled |
| **Install buckets** | Play only | coarse, but real |

### The install problem, stated plainly

**Apple publishes no install counts for apps you do not own.** Neither does
Google, beyond a bucketed `installsText` — "1,000,000+" — that only moves when
an app crosses an order of magnitude.

So there is no way to say "this app got 40,000 installs last month". Anyone
showing you that number for a third-party app has modelled it.

What *is* published, by both stores, for every app, is the **rating count**. It
is a monotonically increasing counter, and its weekly delta is the closest
observable thing to install velocity.

It is a proxy, and the ways it lies are worth stating:

- **Ratings-per-install varies enormously** between categories, and between apps
  that prompt for reviews and apps that do not. A game prompting after every
  level and a banking app that never prompts will show wildly different rating
  velocity at identical install volumes.
- **An iOS rating reset** zeroes the counter. Without care that reads as a
  catastrophic decline.
- **It lags.** People rate after using, so the signal trails installs by days.

Which means rating velocity is usable for **comparing an app against itself over
time**, and for **ranking apps within the same category**, and is not usable as
an absolute install figure. The product must never present it as one.

### What we will not do

No scraping of competitor intelligence products for their install estimates —
the same position as the keyword corpus. Their numbers are modelled, licensed,
and not ours; reselling an estimate we cannot explain would hollow out the one
thing this product is for.

---

## 3. The four signals

### 3.1 Demand growth (per keyword)

The corpus already holds this. `KeywordSignal` is append-only with `capturedAt`,
so the demand index for a term has a history. Re-crawl a prefix a month later
and the delta is real movement.

**Requires:** periodic re-crawling of already-seen prefixes, which the frontier
does not currently do — it marks a task `DONE` and never revisits it.

### 3.2 Supply growth (per keyword)

`KeywordCompetition.resultCount` with `computedAt` — how many apps the store
returns for a term. Re-score a term later, and the change is the number of
developers who entered that space.

This is the cleanest signal in the whole design: directly observed, unambiguous,
already collected.

**Requires:** a re-scoring pass, which today is skipped — `pendingCompetition`
deliberately ignores terms that already have a score.

### 3.3 App velocity (per app)

Rating count delta per week, from repeated listing snapshots.

Normalised by age, because a two-month-old app adding 500 ratings a week is a
different event from a five-year-old app doing the same.

### 3.4 New entrants (per category)

Count of apps whose `releasedAt` falls inside a window, seen in that category's
charts or search results.

**A caution:** Play shows a "released" date that some listings update on major
releases, and an app can be relisted under a new package. Treat the count as an
indicator, not a census.



---

## 4. What makes something appear on the radar

Four quadrants, from demand trend against supply trend:

| | Supply flat | Supply rising |
| --- | --- | --- |
| **Demand rising** | **Gap** — unserved, best case | **Heating** — real market, real competition |
| **Demand flat** | Settled | **Crowding** — stay away |

The product's job is to place a niche in one of those four and say why. A single
"opportunity score" would collapse the two axes into one number and lose exactly
the distinction that makes the tool useful — a Gap and a Crowding market can
produce the same composite score.

So: **two axes, always shown as two.** Any ranking is a sort within a quadrant,
never across them.

### Emergence score, within a quadrant

For ordering inside Heating and Gap:

```
emergence = demandGrowth × marketFactor × confidence
```

where `marketFactor` and `confidence` carry over from the research page — a
niche with two apps and one observation is not a finding, however fast its
numbers moved.

---

## 5. What this feature does not cover

Review mining — the "what are users missing" question — is a separate feature.
See [Gap Finder](./GAP-FINDER.md).

The split is not cosmetic. Every signal in *this* document needs **two
observations separated by time**, and no amount of engineering changes that: a
trend does not exist until it has been watched. Review themes need one pass,
because the reviews are already written.

Keeping them together made the roadmap dishonest — it implied a tool that says
something useful on the day it is switched on, when in fact half of it is blind
for a fortnight.

---

## 6. Schema

Three new models. The corpus tables are reused rather than duplicated.

```prisma
/// An app seen in the wild — from a chart, or from a search result page.
/// Distinct from `App`, which is an app a customer owns and tracks.
model MarketApp {
  id         String   @id @default(cuid())
  platform   Platform
  storeId    String
  country    String   @default("us")
  name       String
  developer  String?
  category   String?
  /// From the store. Null when the store did not report one.
  releasedAt DateTime?
  firstSeenAt DateTime @default(now())
  lastSeenAt  DateTime @default(now())

  snapshots MarketAppSnapshot[]

  @@unique([platform, storeId, country])
  @@index([category, releasedAt])
}

/// A point-in-time reading of one app's public counters.
/// Append-only, like KeywordSignal — velocity is derived, never stored raw.
model MarketAppSnapshot {
  id           String   @id @default(cuid())
  marketAppId  String
  /// The install proxy. Never presented as an install count.
  ratingCount  Int?
  ratingAverage Float?
  /// Android only, e.g. "1,000,000+". Coarse and bucketed.
  installsText String?
  price        Float?
  chartRank    Int?
  capturedAt   DateTime @default(now())

  app MarketApp @relation(fields: [marketAppId], references: [id], onDelete: Cascade)

  @@index([marketAppId, capturedAt])
}

/// A niche: a keyword, or a category, with demand and supply trends attached.
model MarketNiche {
  id        String   @id @default(cuid())
  /// Either a corpus term or a store category id.
  kind      NicheKind
  label     String
  country   String   @default("us")
  platform  Platform

  /// Percent change over the window. Null until two observations exist.
  demandChange Float?
  supplyChange Float?
  /// GAP | HEATING | SETTLED | CROWDING, derived from the two above.
  quadrant   NicheQuadrant?
  newApps    Int      @default(0)
  /// Human-readable, e.g. "demand +34%, 12 → 19 apps, over 28 days".
  method     String
  windowDays Int
  computedAt DateTime @default(now())

  @@unique([kind, label, country, platform])
  @@index([quadrant, demandChange])
}
```

`MarketAppSnapshot` is append-only for the same reason `KeywordSignal` is: a
velocity figure has to be traceable to the two readings that produced it, or it
cannot be defended when someone challenges it.

`MarketReview` and `NicheTheme` live with the Gap Finder and are documented
there.

---

## 7. Collection

Three new job types on the existing BullMQ queue, and two changes to what the
crawler already does.

### New

- **`market.chart`** — read a category chart, upsert every app into `MarketApp`,
  write a snapshot. Charts are already fetched by `itunesChart`/`playChart`; this
  keeps what it currently discards.
- **`market.snapshot`** — re-read a batch of known `MarketApp` listings, write
  fresh snapshots. This is the velocity engine.
- **`market.derive`** — recompute `MarketNiche` rows from the corpus and the
  snapshots. Pure computation, no network.

### Changed

- **Prefix re-crawl.** The frontier marks a task `DONE` for ever. Demand trend
  needs a second observation, so completed prefixes need to become eligible again
  after a cooldown — a `recrawlAfter` timestamp rather than a boolean state.
- **Competition re-scoring.** `pendingCompetition` skips scored terms by design.
  Supply trend needs re-scoring on a cadence, which is the same mechanism as the
  `--backfill-top-apps` pass and should reuse it.

### Cost

The expensive part is `market.snapshot`: one request per app per cycle. Ten
categories × 200 chart entries × 2 platforms is 4,000 apps, and at the 4-second
search-host floor that is roughly four and a half hours per full cycle.

Weekly cycles are the right cadence anyway — rating counts do not move fast
enough to justify daily reads, and a weekly delta is less noisy.

---

## 8. The page

`/radar`, in the app shell beside Research.

**Header** — the four quadrants as a summary: how many niches sit in each,
across the tracked set.

**The main view** — a table of niches, filterable by quadrant, category and
platform. Per row:

| Niche | Demand | Supply | Quadrant | New apps | Evidence |
| --- | --- | --- | --- | --- | --- |
| sleep sounds | +34% | 12 → 19 | Heating | 4 | over 28 days, 3 observations |

**Rising apps** — a second tab. New apps, ranked by age-normalised rating
velocity, with the proxy labelled every time it appears. Columns: app, category,
age, ratings gained per week, and a note that ratings are a proxy for installs.

**Detail** — clicking a niche shows the demand and supply series over time, the
apps that entered it, the themes their users raise, and the observations behind
every number. Same rule as the research page: **no number without its
provenance.**

### What the page must never do

- Show an estimated install count for a third-party app.
- Show a single blended "opportunity score" that hides which quadrant a niche is
  in.
- Present a trend from two observations a week apart as established. Confidence
  is a function of how many observations and how long the window is, and it is
  displayed.

---

## 9. Marketing presentation

**A fourth pillar on the home page**, beside keyword research, rank tracking and
the AI writer — this is a genuinely different product surface, not a feature of
an existing one.

Positioning, in the honest register the rest of the site uses:

> **Find the market before you build the app.**
> Demand and supply, tracked separately, so you can tell a market that is
> opening from one that is filling up. Rating velocity is a proxy for installs
> and is labelled as one — nobody outside Apple has your competitors' install
> numbers, and we will not pretend otherwise.

That last sentence is the differentiator. Competing tools sell modelled install
estimates with a confident number attached; saying plainly that the number is
not obtainable, and showing what *is*, is the same position the keyword corpus
takes.

**Also needs:** a `/benefits#radar` section, a header dropdown entry, and a blog
cluster — "market research" is a natural sixth category, with the pillar being
*How to research an app idea with data you can actually verify*.

---

## 10. Phases

1. **Collection.** `MarketApp` + `MarketAppSnapshot`, the `market.chart` and
   `market.snapshot` jobs, and chart crawling across the category list. Produces
   nothing visible; two cycles are needed before any velocity exists.
2. **Velocity.** Age-normalised rating velocity, the Rising apps view. The first
   screen this feature can show.
3. **Trends.** Prefix re-crawl and competition re-scoring, so demand and supply
   series exist. Requires the frontier change — completed prefixes currently
   never become eligible again.
4. **Quadrants.** `MarketNiche`, `market.derive`, the main table.
5. **Marketing.** Home section, benefits, header, blog cluster.

**Nothing here shows anything for at least two collection cycles.** That is the
honest cost of a trend feature and the reason the Gap Finder ships first — it
gives the product something to show while these series accumulate.
