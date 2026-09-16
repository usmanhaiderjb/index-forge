# Keyword database

Building a keyword corpus with volume estimates, from sources that are ours to
use.

---

## 1. The problem

**Neither store publishes search volume.** Apple and Google both refuse to. Every
"search volume" figure in every ASO tool on the market is an estimate derived
from indirect signals, however confidently it is presented.

So the question is not "where do we get the numbers" — it is "which indirect
signals can we legitimately observe, and how honestly can we report what we
inferred from them".

---

## 2. What we will not do

**We will not scrape other ASO tools.** AppTweak's and Sensor Tower's volume
figures sit behind authentication and are their licensed product. Taking them
breaches their terms and is misappropriation.

It is also self-defeating. This product's entire position is that every number
can be traced to where it came from. Reselling a competitor's estimate — which we
could neither explain nor stand behind — would hollow out the one thing that
makes us different.

Everything below is legitimate and gets further.

---

## 3. Signals we can observe

### Already in use

> **Play autocomplete was dead.** `market.android.com/suggest/SuggRequest` now
> answers 404 and the old `catch` swallowed it into an empty array, so Android
> keyword popularity had silently degraded to a constant floor with nothing
> reporting an error. Replaced with `suggestqueries.google.com` and `ds=play`,
> which is Play-specific — plain `suggestqueries` without `ds` returns web
> intents like "habit tracker excel template", which say nothing about app-store
> demand. Responses arrive as `play/{locale}&{type}@{vertical}|{term}`, mixing in
> books and movies, so only `@apps` rows are kept.

| Source | What it gives |
| --- | --- |
| `search.itunes.apple.com` hints | Apple's own suggestions, **ordered by search popularity** |
| `market.android.com/suggest` | the same for Play |
| `itunes.apple.com/search`, Play search | result counts — competitive density |
| Top charts | which apps rank, per category and country |

`estimatePopularity` in `src/server/aso/builtin/index.ts` already turns
suggestions into a 0-100 proxy. What it does not do is keep them: the corpus is
thrown away after scoring one app's keyword.

### The signal we are under-using

**Autocomplete is ordered.** Both stores return suggestions ranked by how often
people search them. Position within that list is an ordinal popularity signal,
and it is free. A term suggested first for its prefix is searched more than the
term suggested eighth.

That is enough to rank millions of terms against each other without paying
anyone. It is not enough, on its own, to say "18,400 searches a month" — see §6.

### Not yet used

- **Prefix expansion.** Feed `a`, `b`, … `z`, then `aa`, `ab`, … through
  autocomplete. The store returns real terms for each. This is how a corpus
  bootstraps from nothing.
- **Metadata mining.** Tokenize titles, subtitles and descriptions of apps
  ranking in each category. Terms that appear across many ranked apps in a
  category are terms those developers believe are worth targeting.
- **Related searches.** The App Store surfaces "customers also searched".
- **Google Trends, Wikipedia pageviews.** Seasonality and relative interest —
  not app-specific, useful as a shape rather than a level.

---

## 4. The signal nobody else has: our customers' Apple Search Ads

ASA search-term reports contain **measured impressions per term per storefront**.
Not an estimate. Actual counts, from Apple.

Nobody outside Apple has that for iOS. Every competitor is estimating. A customer
running even a small ASA campaign is holding ground truth for the terms they bid
on — and we already have the connector.

Used properly this is a compounding advantage: each customer who connects ASA
sharpens the estimates for everyone. It is also the part that needs the most
care, so it gets its own rules:

- **Explicit opt-in.** A customer's ASA data is theirs. Contributing it to a
  shared model is a decision they make, not a default they discover.
- **Aggregate only.** A term's calibration point is derived from many accounts,
  never stored in a way that reveals one advertiser's spend or volume.
- **No leakage back.** A customer must never be able to read another customer's
  figures out of the estimates.

Without opt-in the corpus still works — it just stays ordinal rather than
calibrated.

---

## 5. Schema

Three tables, deliberately separate from the existing per-app `Keyword`:

```prisma
/// The global corpus. One row per term per storefront.
model KeywordTerm {
  id         String   @id @default(cuid())
  term       String
  country    String
  locale     String
  /// Where it was first seen: prefix crawl, metadata mining, a customer adding it.
  discovery  TermDiscovery
  firstSeenAt DateTime
  lastSeenAt  DateTime
  @@unique([term, country])
}

/// One observation. Append-only; nothing is overwritten.
model KeywordSignal {
  id         String   @id @default(cuid())
  termId     String
  source     SignalSource   // SUGGEST_RANK | SUGGEST_CONTAINS | RESULT_COUNT | CHART_PRESENCE | ASA_IMPRESSIONS
  value      Float
  /// The prefix that produced a SUGGEST_RANK, so the observation is reproducible.
  context    String?
  capturedAt DateTime
}

/// What we currently believe, and how sure we are.
model KeywordVolumeEstimate {
  id         String   @id @default(cuid())
  termId     String   @unique
  /// 0-100 ordinal index, or a real monthly figure when kind is MEASURED.
  value      Float
  kind       EstimateKind   // ESTIMATED | MEASURED
  confidence Confidence     // LOW | MEDIUM | HIGH
  /// Human-readable: "autocomplete rank across 6 prefixes".
  method     String
  computedAt DateTime
}
```

`KeywordSignal` being append-only is what makes the estimate explainable: any
number can be traced back to the observations that produced it, which is the same
rule `MetricPoint` follows.

`kind` exists so the UI can say **estimated** or **measured** rather than
implying both are the same thing. Competitors are vague here. We should not be.

---

## 6. Turning ordinal signals into a number

Honest sequencing, because getting this wrong produces a confident fiction:

**Phase A — ordinal only.** Terms are ranked against each other. The UI shows a
0-100 index labelled *estimated*, and says what it is: relative demand inferred
from how the store orders its own suggestions. No monthly figure is claimed,
because none is known.

**Phase B — calibrated.** With opted-in ASA impressions as ground truth, fit a
monotonic mapping from the ordinal index to real volume. Isotonic regression or
simple bucketing; no machine learning needed. Terms with a customer's own ASA
data show `MEASURED` and the real number.

**Never** invent a monthly figure by scaling a guess. An index that says "this
term is more popular than that one" is useful and true. "12,400 searches" that
came from nowhere is neither.

---

## 7. Crawling politely

The corpus crawl multiplies request volume by orders of magnitude over what the
per-app scrapers do. That changes the risk:

- Reuse `ASO_SCRAPE_DELAY_MS` and `ASO_USER_AGENT`. The delay exists to be
  honest, not to be tuned down.
- One crawl job per prefix, on the existing BullMQ queue, so concurrency is
  bounded by the worker rather than by a loop.
- Cache aggressively: a prefix's suggestions do not change hourly.
- Back off hard on 429 and 5xx, and stop the whole crawl rather than hammering.
- Never crawl on a request path. This is background work only.

**These endpoints are undocumented.** They change without notice, they rate
limit, and their terms are grey. That exposure already exists for the per-app
scrapers, so it is not a new category of risk — but a corpus crawl makes it
bigger, and it is worth a lawyer's read before this becomes a headline feature.

---

## 8. Phases

1. ~~**Corpus + prefix crawl**~~ — **built.** `KeywordTerm` / `KeywordSignal` /
   `KeywordVolumeEstimate`, `src/server/aso/corpus.ts`, the `corpus.crawl` and
   `corpus.estimate` jobs, and `npm run corpus:crawl`. Verified against both
   live stores: 115 terms from 8 prefix crawls, every estimate labelled
   `ESTIMATED` with its method and a confidence derived from how many distinct
   prefixes saw the term.
2. ~~**Metadata mining from ranked apps per category**~~ — **built.**
   `src/server/aso/mining.ts`, plus difficulty scoring in
   `src/server/aso/difficulty.ts` and the resumable frontier in
   `src/server/aso/frontier.ts`. Run it with `npm run corpus:build`; see §9.
3. ASA calibration with opt-in
4. ~~**Keyword research UI over the global corpus**~~ — **built.** `/research`,
   backed by `src/server/api/routers/research.ts` and the pure scoring in
   `src/server/aso/research.ts`. Search by seed term, filter by demand floor
   and difficulty ceiling, and open any term to see the individual observations
   behind its numbers. See §10.
5. ~~**Related-term graph and clustering**~~ — **built.**
   `src/server/aso/clustering.ts`, exposed as `research.related` and
   `research.clusters` and shown on `/research`. See §11.

---

## 9. Running it at scale

`npm run corpus:build` is a long-running crawler rather than a script that
finishes. Everything it does is a row in `crawl_tasks`, so it can be killed and
restarted without losing more than the tasks in flight.

```bash
npm run corpus:build -- --target 200000     # stop at 200k terms
npm run corpus:build -- --hours 168         # a week, then stop
npm run corpus:stats                        # what the corpus holds now
```

### Lanes

Six run concurrently, two per store:

| Lane | What it does | Host it talks to |
| --- | --- | --- |
| prefix | expands a prefix through autocomplete | `search.itunes.apple.com`, `suggestqueries.google.com` |
| category | mines a chart's metadata | `itunes.apple.com`, `play.google.com` |
| difficulty | scores one term's competition | `itunes.apple.com`, `play.google.com` |

The throttle is per host, so lanes on different hosts genuinely overlap. That
is where the throughput comes from, and it is also why raising `--delay` costs
less than it looks like it should.

### The frontier is what makes it big

A fixed two-letter sweep is 676 prefixes and yields a few thousand terms. The
frontier instead **expands prefixes that paid off**: a prefix that discovered
something new earns 52 children — `prefix + letter` and `prefix + space +
letter`. The second form is what reaches multi-word searches, since "habit t"
returns "habit tracker" and no amount of three-letter prefixing would find it.

A prefix that discovers nothing earns nothing, so the crawl abandons dead
branches instead of spending a day on 26 variants of one.

Measured: **~47,000 new terms an hour** at a 900 ms delay, with the frontier
growing faster than it is consumed. Hundreds of thousands of terms is hours,
not the week that was budgeted for it.

### Demand and difficulty are separate passes

Discovery costs one request per prefix. Scoring costs **one request per term per
store**, which is the expensive half — 200,000 terms is 400,000 search requests.
So scoring runs highest-demand-first and lags far behind discovery on purpose. A
corpus with 5,000 scored head terms and 200,000 unscored tail terms is more
useful than one uniformly half-scored.

`KeywordCompetition` is keyed by platform because difficulty is: the same term
can be winnable on the App Store and hopeless on Play. Volume is not split that
way — someone searching "habit tracker" wants the same thing on either store.

### Things that will bite

- **Postgres must be UTF8.** `initdb` on Windows takes its encoding from the OS
  codepage, which produced a WIN1252 cluster here. Every non-ASCII term then
  fails to insert — silently dropping the entire international long tail, and
  stalling the lanes into exponential backoff while they retry. `scripts/local-db.ts`
  now creates its database `TEMPLATE template0 ENCODING 'UTF8'`. Check an
  existing one with `SELECT pg_encoding_to_char(encoding) FROM pg_database`.
- **Requests need a deadline.** A store under load will accept a connection and
  never answer. `storeFetch` now times out at 20 s, because without it one hung
  socket parks a lane for the rest of the run and the symptom is "the crawler
  stopped finding terms" rather than an error.
- **Search and autocomplete need different delays.** Over a five-hour build the
  two autocomplete hosts were never rate limited once, while both search hosts
  throttled repeatedly. `ASO_SEARCH_DELAY_MS` (default 4000) applies a slower
  floor to `itunes.apple.com` and `play.google.com`; `ASO_SCRAPE_DELAY_MS`
  governs everything else. One global delay cannot express this — set slow
  enough for search, discovery runs three times slower for no reason.
- **Apple answers 403, not 429.** Anything classifying throttling by status has
  to treat both as the same thing, and it is worth classifying on the status
  code rather than the message text.
- **Expect to be rate limited anyway.** Lanes back off on their own, but a
  blocked IP is a blocked IP.
- **Mining needs a quality floor.** Terms shared by two or more ranked apps
  includes "contact us via app". A term is only kept if at least one ranked app
  put it somewhere the store indexes — a title or subtitle on iOS, plus the
  short description on Play.
- **Google's suggest endpoint answers in Latin-1** unless `ie=UTF-8&oe=UTF-8`
  are on the query string. It even says so — `charset=ISO-8859-1` — but
  `res.text()` decodes as UTF-8 regardless, so "qualité de l'air" was stored as
  "qualit�e de l'air". Corrupt, not rejected, which is the worse of the two.
  Thirty-seven such rows were found and deleted; there is no repairing them,
  only recrawling.

### Changing a scoring rule means restarting the crawler

A long-running build holds its code in memory, and its maintenance lane rewrites
estimates every ninety seconds. Change a scoring rule while one is running and
the two silently contest each other — the crawler keeps stamping the superseded
rule over the corrected one, neither side errors, and you end up with rows
scored by two different rules and no marker saying which.

This was caught only because the wording of the explanation changed too, making
the two versions visually distinguishable on the page. Same class of hazard as
the Prisma engine lock, different mechanism: **stop anything long-running that
writes scores before changing how scores are computed.**

### Known limits

- **One locale.** `playSuggest` sends `hl=en`, so the corpus is English demand
  in whatever country is passed. A genuinely multi-market corpus needs the
  locale threaded through the crawl and `KeywordTerm` already carries the
  column for it — nothing else does yet.
- **No refresh cadence.** Terms are discovered and scored once. Demand moves,
  and a corpus that never re-reads is a snapshot that ages.


---

## 10. The research screen

`/research`. One rule holds it together: **never show a number without saying
where it came from.** Every demand index carries its method inline, every
difficulty carries the result set it came from, and any row opens onto the
individual `KeywordSignal` rows underneath — "suggested on App Store for 'u n',
rank score 31". That panel is the reason `KeywordSignal` is append-only.

### Confidence measures the field a term beat

A demand index derived from autocomplete ordering needs a companion answer to
"how much should I trust this". Getting that answer right took three attempts,
and **each wrong version produced plausible-looking output** — which is why the
check that mattered was always "does `facebook` outrank `zr cheaper`", never the
aggregate counts.

| Attempt | Rule | Why it failed |
| --- | --- | --- |
| 1 | count distinct prefixes | measures how hard the crawler looked; deep frontier expansion inflated obscure strings to HIGH |
| 2 | require the prefix to be a real prefix of the term | correctly dropped fuzzy matches, but still rated `zr cheaper` as highly as `facebook` |
| 3 | reward short winning prefixes | assumed all two-letter prefixes are equally hard to win |

They are not. In this corpus **1,096 terms start with `fa` and 46 start with
`zr`** — so leading `zr` beats forty-six things, while leading `f` beats 22,644.

Confidence is therefore proportional to the size of the letter-space the term
wins, measured from the corpus itself with three `GROUP BY`s. The evidence line
states it outright:

> top suggestions for "h" on Play, ahead of 14,997 other terms starting the same way

Note this **inverts the prefix rule used for clustering**, where a *longer*
shared prefix means two terms are more related. Both are correct: length means
specificity, and specificity is evidence of relatedness but the opposite of
evidence of demand.

Fuzzy matches are still recorded and still say nothing — Apple returned
`b-isolar` for `b js`, `b ks` and `b us`, queries it does not begin with.

### Two things that are not opportunities

- **A term nothing ranks for.** `marketFactor` zeroes it and ramps to full
  weight by ten ranking apps. The difficulty model made this actively worse: a
  shallow result set *lowers* difficulty, so a term with zero results scored
  difficulty 0, read as "easy", and led the page.
- **A term seen once.** Covered by confidence above.

### Confidence is part of the ranking, not a footnote

The first working version of this page was useless, and usefully so. Sorted by
opportunity, the top of the corpus was `gk gs masti`, `dchb 2027`, `eji seyer` —
obscure names scoring a perfect 100. Each was the *only* suggestion the store
returned for some rare two-letter prefix, and `rankScore` cannot tell that apart
from being the first suggestion for "ha".

So the ranking now discounts by evidence: LOW confidence (one prefix) is halved,
MEDIUM (two or three) takes 0.8, HIGH (four or more) is untouched. The same page
then opens on `e-z pass`, `jpay`, `gmail`, `life 360`.

The discount is shown in the table rather than applied quietly. A hidden
adjustment is indistinguishable from a wrong number.

### What it does not do

- **No monthly volume figure**, and there will not be one until ASA calibration
  lands. The index says this term is searched more than that one, which is true;
  "12,400 searches" would not be.
- **Unscored is blank, not zero.** Difficulty lags discovery by design, and the
  corpus summary above the results says what fraction is covered.
- **One country per query.** The corpus is keyed by country and the UI defaults
  to `us`; other storefronts need crawling before the filter is worth exposing.

---

## 11. Related terms and clustering

A corpus is a list until you know which terms are the same search wearing
different words. Two views use it: **Clusters** on `/research`, and a related-
terms section in each term's evidence panel.

No new tables and no new store requests — the relationships come out of signals
already stored. `KeywordSignal.context` does double duty, holding the prefix for
a `SUGGEST_RANK` and the `PLATFORM:CATEGORY` for a `CHART_PRESENCE`, which is
the whole reason this works without materialising a single edge.

### The three signals

| Signal | Why it relates two terms | Strength |
| --- | --- | --- |
| Shared ranking apps | the store returns the same apps for both | shared count against a target of 5 |
| Shared prefix | the store completed both from the same typed string | scales with prefix length |
| Shared category | both are used by apps ranking in the same chart | Jaccard over categories |
| Shared words | the obvious one | Jaccard over tokens |

Shared ranking apps is the only *direct* signal — the other three are
circumstantial. It is deliberately **not** a Jaccard: two terms sharing three
apps out of two ten-app result sets score 3/17 by Jaccard, which reads as
unrelated, when three of the same apps ranking for both is the store saying
they are one search. Counting against a fixed target of five is how this is
done in practice.

The **strongest single** signal sets the score rather than a sum of all three. A
sum lets three coincidences masquerade as one real relationship, and it destroys
the explanation — "0.62" tells a reader nothing, while `both completed from
"bb c"` is a claim they can check in the store themselves. Corroborating signals
add a little, but cannot promote a pair that had no evidence.

### Three things it got wrong first

Each was visible only against real data, which is why the page was built before
the model was trusted.

1. **Sharing two letters is not a relationship.** Without scaling by prefix
   length, every term beginning "ha" clustered together and the output was an
   alphabet rather than a set of topics.
2. **Counting shared categories relates a brand to everything.** "google"
   appears in eight category charts, so it shared one with "secure vpn", "word"
   and "amazon" and swept them all into one cluster. Jaccard fixes it: one
   category out of eight is noise, while two terms whose *only* category is the
   same one are the same subject.
3. **Clustering the highest-demand terms clusters nothing.** The first run
   produced 194 groups of one, because the top of the corpus by raw index is
   single-observation terms each from a different prefix — nothing shares
   anything. The working set is now chosen by confidence first.

### Why star clustering

Connected components chain: A relates to B, B to C, C to D, and the result is
one enormous cluster whose ends are unrelated. Instead each cluster is every
term relating to a single centre, and the centre is the highest-demand member —
so a cluster stays coherent and gets its name for free.

### Known limits

- **A short shared prefix is not a relationship.** Four characters used to clear
  the bar, which produced a twelve-term cluster of "backyard baseball",
  "background eraser", "backrooms 2" and "backup sms" — words beginning "back"
  and nothing more. A stem now needs either length or a second signal agreeing
  with it, so that group collapsed to the four genuine *backrooms* terms while
  "bbc news"/"bbc sport" survived on their shared word. This loses some true
  groupings, which is the right way round: a missing cluster is a gap, a wrong
  one is a lie.
- **`topApps` coverage is partial.** The column went in after roughly 13,000
  terms had already been scored, and those rows carry a difficulty but no result
  set. `serpOverlap` reads an empty list as "not measured" rather than "no
  overlap", so they fall back to the other three signals.

  `npm run corpus:build -- --backfill-top-apps` re-scans them, highest demand
  first, and `--lanes difficulty` runs the scoring lanes alone so discovery
  cannot push the corpus past `--target` and end the run before the backfill
  drains. It is opt-in because it competes for the same rate limit as scoring
  terms that have no difficulty at all, and a term with a stale number beats a
  term with none.

  **Run once, over 3,184 rows.** 3,124 filled; the remaining 60 are terms the
  stores return no results for, so an empty `topApps` is the correct answer for
  them rather than missing data. That distinction is load-bearing: the first
  attempt looped on those sixty forever, re-scoring them, getting an empty
  result back, and picking them up again — the candidate query now requires
  `resultCount > 0`, which is what makes it terminate.
- **Clustering is bounded** to a working set (200 by default). The bound is
  reported in the interface rather than applied silently.
