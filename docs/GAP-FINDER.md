# Gap Finder

What users say is missing from the apps already serving a market.

Split from [Trends](./TRENDS.md) deliberately. The two answer different
questions, run on different data, and — critically — become useful at different
times. Trends needs weeks of observation before it can say anything. This does
not.

---

## 1. The question

> **What should I build?**

Trends tells you *where* a market is moving. It cannot tell you what to make,
because a rising install curve says nothing about what its users are missing.

That answer is already written down, in public, by the users of every app in the
category. Nobody reads it at scale because reading four hundred reviews across
six competitors is tedious in exactly the way machines are good at.

## 2. The rule that makes it a finding

A one-star review saying "wish it worked offline" is one person having a bad
day.

**The same complaint across four of the top ten apps is a market gap.**

So the unit of analysis is not a review and not an app. It is a **theme within a
niche, counted across apps**:

- Rank by mention count and the app with the most reviews wins every row. The
  tool then reports the loudest app's problems as the market's.
- Rank by how many *distinct apps* carry a theme, and what surfaces is what the
  category as a whole is failing at.

Breadth is squared in the weighting, so five apps counts for far more than twice
what two apps does. A gap is defined by being shared.

Dissatisfaction is the second multiplier: the same words inside a five-star
review are a wish, inside a one-star review they are why someone left. Never
zeroed, because a feature request from a happy user is still a signal.

## 3. Where the data comes from

**This was the hard part, and the answer is worse than expected.**

Neither store serves third-party review text through anything documented. Both
of the obvious routes are dead, verified directly:

| Route | Result |
| --- | --- |
| Apple `rss/customerreviews` | **200, zero entries.** Current `updated` timestamp, blank first/last links. A shell. |
| Apple `?see-all=reviews` | no payload in HTML |
| Apple `amp-api` | **401**, and the bearer token is no longer in the page or its scripts |
| Play listing page | **0** review ids embedded |
| Play `showAllReviews=true` | no payload |

Both stores moved reviews to client-side fetches behind internal APIs.

### What works

Play's `batchexecute` endpoint, RPC `UsvDTd` — the call the Play web interface
makes when it shows you reviews. Returns 40 per request with a pagination
cursor, carrying id, rating, body, timestamp, thumbs-up and app version.

**iOS is not covered.** Apple's equivalent needs a token that would require
driving a real browser to capture. That is a materially larger commitment and a
different risk posture, so it is not in this feature.

### The risk, stated plainly

This is an undocumented, unversioned, reverse-engineered endpoint. The RPC id,
the request shape and every array position are things Google can change without
notice. `KEYWORD-DATABASE.md` §7 already flags this class of dependency as
wanting a lawyer's read; this raises that exposure rather than adding to it.

Two engineering consequences:

1. **Fail loudly on an unexpected shape.** `parsePlayReviews` throws rather than
   returning an empty array, because a silent empty result is how a broken
   scraper survives for months looking healthy — precisely what Apple's dead
   feed does.
2. **A null payload is throttling, not breakage.** Play answers 200 with an
   empty payload when it wants you to slow down, never 429. Observed directly: a
   burst of probes turned every app into a null payload for minutes, then it
   recovered with no code change. Classified as 429 internally so lanes back off
   instead of declaring the integration dead.

## 4. Privacy

The endpoint returns author names. **They are dropped on ingest.**

`MarketReview` has no `authorName` column at all — not nullable, absent. For an
app we do not represent, the reviewer has no relationship with us and their name
serves no purpose in market research. The customer-facing `Review` model keeps
the field because replying to your own reviewer needs it.

## 5. Cost control

Theme extraction is the only part of either feature with a per-unit AI cost.

- Classify with `ANTHROPIC_MODEL_BULK` — it exists for this shape of job.
- Classify each review **once**, keyed by store review id. Never re-run.
- Batch reviews per request rather than one call each.
- Draw from a **separate allowance**. Market research must never consume the
  budget a customer's own insights depend on, so it stops rather than borrowing.

## 6. The page

`/gaps`, in the app shell.

Pick a niche — a category or a keyword — and see what its users are missing:

| Theme | Kind | Apps affected | Mentions | Mean rating |
| --- | --- | --- | --- | --- |
| no offline mode | Missing feature | 6 of 10 | 84 | 2.1 |
| ads between every session | Monetisation | 4 of 10 | 51 | 1.8 |

Every row expands to the review excerpts behind it. **A theme with no quotable
evidence does not render** — enforced in the query, not left to the interface.

Themes are labelled as inference wherever they appear. They come from a language
model reading review text, which is a model and not a measurement, and the
failure modes are real: the review sample is biased toward recent and
"most helpful", classification drifts between runs, and a theme's absence is not
evidence it does not exist.

## 7. Status

| Piece | State |
| --- | --- |
| Schema — `MarketApp`, `MarketReview`, `NicheTheme` | **built**, migrated |
| Play review client + parser | **built**, verified live |
| Throttle classification | **built** |
| Theme aggregation + weighting | **built**, 14 tests |
| LLM classification | not built |
| Ingest job + page | not built |

Next: classification, then the ingest job, then the page.
