# IndexForge

**Engineer Your App Store Dominance.**

App Store Optimization platform. Connects Firebase/GA4, AdMob, Google Ads, Play Console,
App Store Connect and Apple Search Ads; tracks keywords, ranks, competitors and reviews daily;
splits store traffic by where it came from; and turns all of it into character-limit-aware
listing changes.

> **New to this codebase?** Read **[docs/HANDOVER.md](docs/HANDOVER.md)** — full architecture, the
> rules that keep the numbers correct, a production-readiness checklist, deployment, and an honest
> list of what is unverified.

- **Stack** — Next.js 15 (App Router) · tRPC v11 · Prisma + Postgres · BullMQ + Redis ·
  Auth.js v5 · Tailwind v4 · Recharts · MDX · Anthropic Claude
- **Two processes** — the web app (`npm run dev`) and a worker (`npm run dev:worker`).
  Nothing syncs without a worker running.
- **Two surfaces** — a public marketing site and blog at `/`, and the signed-in app under
  `/dashboard`. See [Public site](#public-site).

---

## Quick start

```bash
npm install
npm approve-scripts prisma @prisma/client @prisma/engines esbuild unrs-resolver
```

```bash
docker compose up -d
```

```bash
cp .env.example .env
```

### No Docker?

Postgres can run straight from `node_modules`, with its data directory inside the project —
nothing is installed system-wide and cleanup is deleting `.localdb`:

```bash
npm run localdb
```

Leave that running and continue with `db:push` / `db:seed` below. `npm run localdb:reset` wipes
the cluster and starts over.

Redis has no official Windows build. Options, in order of preference: Docker (above), **Memurai
Developer** (`winget install Memurai.MemuraiDeveloper` — Redis 7-compatible, free for
development), or WSL. Without Redis the app still runs and every page renders; only the actions
that queue background work (Refresh, Sync, rank check) fail, with a message saying so.

Fill in the two values that have no default, then push the schema and seed:

```bash
node -e "console.log('AUTH_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
```

```bash
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
```

```bash
npm run db:push
```

```bash
npm run db:seed
```

Then run both processes in separate terminals:

```bash
npm run dev
```

```bash
npm run dev:worker
```

Open http://localhost:3000. In development a passwordless **Developer login** provider is
registered — sign in with `founder@example.com` (the seeded owner) to land in a workspace with
90 days of data. That provider is never registered when `NODE_ENV=production`.

---

## What runs where

| Process | Command | Responsibility |
|---|---|---|
| Web | `npm run dev` / `npm start` | UI, tRPC API, OAuth callbacks, health check |
| Worker | `npm run dev:worker` / `npm run worker` | Every sync, scrape, rank check, AI pass and alert evaluation |

On a platform with no long-lived process, skip the worker and drive the queue from an external
scheduler instead:

```bash
curl -X POST "$APP_URL/api/cron?job=tick" -H "Authorization: Bearer $CRON_SECRET"
```

`?job=tick` fans out per-tenant work; `?job=alerts` evaluates alert rules. Both only *enqueue* —
something still has to drain the queue.

`GET /api/health` returns 503 when Postgres or Redis is unreachable, with queue depth attached.

---

## Connecting integrations

All five connectors implement one interface (`src/server/integrations/types.ts`), so adding a
sixth is a file plus a registry entry.

### Google (Firebase, AdMob, Google Ads, Play Console)

One OAuth client, scopes requested per integration. In Google Cloud Console create a **Web**
OAuth client with redirect URI `http://localhost:3000/api/oauth/google/callback`, then enable:
Firebase Management API, Google Analytics Admin + Data API, AdMob API, Google Ads API, Google
Play Android Developer API.

Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`, then connect from
**Integrations**. Google only returns a refresh token on first consent — the callback refuses to
store a connection without one and tells you to revoke at
[myaccount.google.com/permissions](https://myaccount.google.com/permissions) and retry.

**Google Ads** additionally needs `GOOGLE_ADS_DEVELOPER_TOKEN` from your Ads manager account.

**Play Console** has no REST endpoint for install statistics — they are published as CSV in a
private Cloud Storage bucket. Copy the bucket id from Play Console → Download reports and paste
it into the **Play reports bucket** field when linking the app. Crash-free rate comes from the
Play Developer Reporting API, which does have a real endpoint. Reviews from the API cover only
the last 7 days; that is Google's limit, not ours.

### Apple (App Store Connect)

App Store Connect → Users and Access → Integrations → App Store Connect API. Create a key with
at least the **Sales** role, then paste the issuer ID, key ID and `.p8` contents into
**Integrations**. Sales & Trends units also need your **vendor number**. The key is encrypted
with AES-256-GCM before it is written and is never returned to the browser.

### Apple Search Ads

A **separate credential from App Store Connect**, from a different console, with a different
`.p8` key. Search Ads → Account Settings → API gives you a client ID, team ID, key ID and key;
you also need the numeric **org ID**. An App Store Connect key pasted here is rejected up front
rather than failing later as an opaque `invalid_client` from Apple.

Auth is OAuth client-credentials where the client secret is itself an ES256 JWT we sign per
request batch, audience `https://appleid.apple.com`. Resources are listed per **promoted app**
rather than per campaign — campaign ids churn every time an account is restructured, and the
`adamId` is the App Store id, so apps auto-match on link.

Spend from Search Ads is **added** to Google Ads spend rather than replacing it. See
[Where a number comes from](#where-a-number-comes-from).

```bash
npm run smoke:search-ads
```

---

## Where the ASO data comes from

**Neither store publishes a keyword-rank API.** This is the single most important thing to know
about the numbers in this product:

| Signal | Source | Nature |
|---|---|---|
| Rank per keyword | iTunes Search API (iOS) / Play search results (Android) | Measured position in the public results. Close to store search, not byte-identical. |
| Keyword popularity | Store autocomplete presence and rank | Proxy. Stores only suggest terms people search for. |
| Keyword difficulty | Top 10 results: rating count and average on iOS, **star ratings only** on Android | **Explicit model**, not a measurement. Play publishes no rating counts in search, so the two stores' numbers are built from different inputs and should not be compared across stores. |
| Listing text, ratings, screenshots | Store listing pages | Measured. |
| Installs, revenue, retention, spend | The connected accounts | Measured, from first-party APIs. |

Swap the whole layer for a paid provider by setting `ASO_PROVIDER=apptweak` and `APPTWEAK_API_KEY`
— everything above the `AsoProvider` interface is unchanged.

Outbound store requests are serialized per host across every worker via a Redis throttle
(`ASO_SCRAPE_DELAY_MS`, default 1200ms) and carry `ASO_USER_AGENT`. Set that to something that
identifies you.

### Growing the collections

One long-running process feeds all three collections — the keyword corpus, Trends and the Gap
Finder:

```bash
npm run grow
```

Needs Postgres and Redis up first (`npm run localdb` in another window). Ctrl+C stops it; every
lane resumes from the database, so nothing is lost but the request in flight.

The lanes share **one 4s-per-request gate on `play.google.com`**, so running all three does not
add throughput — it splits the same budget. Trends and gaps are deliberately infrequent so the
keyword crawl keeps most of it.

| Flag | Default | Effect |
|---|---|---|
| `--sweep-hours=N` | 12 | How often the charts are re-read. Trends needs *repetition*: a climb is the difference between two readings. |
| `--niche-hours=N` | 24 | Full pass over every category's reviews. One category per cycle. |
| `--chart-depth=N` | 20 | Apps per category per sweep. |
| `--no-trends` / `--no-gaps` / `--no-keywords` | — | Turn a lane off. |
| `-- <args>` | — | Everything after a bare `--` is forwarded to `build-corpus.ts`. |

Gap themes need a working AI key; reviews are still collected and stored without one, and the
lane says so rather than reporting zero themes as though there were none to find.

---

## AI

Set `ANTHROPIC_API_KEY` to enable keyword strategy, metadata generation, review themes,
competitor gap analysis, anomaly explanation and recommendations. Everything else — tracking,
ranks, the deterministic listing audit, alerts — works without it.

Design notes:

- **Detection is numeric, explanation is AI.** Anomalies are found by comparing a 14-day window
  against the prior one with per-metric thresholds; only the ones that clear are sent to the
  model. That keeps spend on explanation rather than on scanning.
- **Structured outputs, not parsed prose.** Every call uses `messages.parse()` with a schema, so
  a caller gets a typed object or an error.
- **The character limit is enforced twice.** The model is told the limit, and any variant over it
  is discarded server-side rather than shown as valid.
- **Usage is attributed.** Every call writes an `AiUsage` row with tokens and estimated list-price
  cost, capped by `AI_MONTHLY_TOKEN_BUDGET` per organization per month.

`ANTHROPIC_MODEL` defaults to `claude-opus-5`. `ANTHROPIC_MODEL_BULK` (default `claude-sonnet-5`)
is used only for per-review classification, which is thousands of short calls.

---

## Digests and export

**Digests** are recurring summaries sent to the same channels alerts use. The distinction is
intent: an alert fires when something crosses a line, a digest arrives whether or not anything
happened — and a week where nothing moved is itself information, so a quiet period says so
rather than arriving blank.

- Due-ness is computed from `lastSentAt`, not from the clock alone. A worker that was down for a
  day sends one catch-up digest instead of skipping the period silently, and a worker restarted
  twice in an hour does not send twice.
- Everything is period-over-period against an equal-length prior window, so the digest reports
  movement rather than absolute numbers nobody can calibrate.
- An empty app list means *every active app*, so the digest keeps working as apps are added
  instead of quietly omitting them.
- **Send now** delivers inline so a failure reaches you, and **Preview** renders the digest
  without sending it.

**Export** covers metrics, keywords and ranks, reviews, chart positions, and listing history, as
CSV or JSON, from `/api/export` (session) or `/api/v1/export` (API key).

- Cells beginning `=`, `+`, `-` or `@` are prefixed with a quote. A review body starting with `=`
  is attacker-controlled text that a spreadsheet would **execute on open** — that is a real
  injection path in exported data, not a theoretical one.
- A UTF-8 BOM is emitted so Excel opens non-Latin review text correctly instead of as mojibake.
- Rows are flattened — dimensions become their own columns — because an export is opened in a
  spreadsheet, where a nested object in a cell is useless.

```bash
npm run smoke:api
```

---

## Screenshot analysis

Screenshots move conversion more than any text field, and they are the one part of a listing
nothing else in this product can read. The **Creatives** tab captures the gallery per storefront
and runs a vision critique over it.

- Images are passed **by URL**, not uploaded — the store CDN already serves them, so nothing is
  downloaded or re-encoded. Anything not fetchable over HTTPS (an inline `data:` URL, plain HTTP)
  is filtered out and reported, rather than failing inside the API call.
- The model sees the images **in gallery order** and is asked to judge the sequence, not only each
  image alone — the first two carry most of the effect and are seen at thumbnail size, so a
  caption that is unreadable small is doing no work.
- Only the first six are analyzed. Each image costs tokens, and the later ones are rarely
  scrolled to; the UI says how many were skipped rather than implying the whole gallery was read.
- Vision is the most expensive call here, so it gets a tighter per-minute budget than the text
  features.
- `suggestedOrder` returns the original order unchanged when it is already right, so the feature
  does not manufacture a change to look useful.

---

## Chart rank

Chart position is a different signal from keyword rank: it tracks download velocity rather than
relevance, so a listing edit moves keyword rank while a feature or a campaign moves the chart.
Both the app's **category** chart and the **overall** chart are scanned daily — an app is
routinely inside the top 100 of its category while nowhere near the overall list, and only the
former is a number anyone can act on.

- **iOS** uses Apple's legacy RSS feeds, chosen over the newer marketing-tools API because only
  the legacy one supports a genre filter.
- **Android** has no chart API and the old collection URLs redirect, so the category pages are
  read in document order — the same approach used for search, which survives Google reshuffling
  the embedded payload. Top Grossing is not exposed there at all and is reported as an empty scan
  rather than silently returning the free chart.
- A **null rank is recorded alongside the scan depth**, so "outside the top 200" is distinguishable
  from "never checked" — an unchecked day has no row at all. An unreachable chart records nothing
  rather than a false negative.
- `category` is the literal `"overall"` rather than `NULL`, because Postgres treats every NULL in
  a unique index as distinct — a nullable column there would insert a duplicate row every day
  instead of upserting.

---

## Replying to reviews

A reply is public content published under the developer's name and read by every future visitor
to the listing, so the flow is built to be deliberate:

- **Drafting never publishes.** The AI writes a draft into an editor; publishing is a separate,
  explicitly confirmed action.
- The character counter is the **store's real limit** — 350 on Google Play, 5,970 on the App
  Store — and it is enforced before anything is sent. When no connection is linked yet the limit
  still comes from the review's source, so an iOS review never shows Google's 350.
- Replies are **not retried**. A timeout after the write has landed would publish twice.
- The local row is written **only after the store accepts**, so a failed publish never leaves the
  dashboard claiming a reply nobody can see.
- The reply is routed through the connection that produced the review, so an app linked to both
  stores cannot answer a Play review with the Apple key.
- The model is told not to promise fixes, dates or refunds, and not to ask for a rating change.
  Reviews alleging data loss, billing or legal problems are flagged `needsHumanReview` and get an
  acknowledgement rather than a templated answer.

---

## Multi-locale

Both stores serve different text per country, so an app that ranks in the US can be invisible in
Brazil purely because nobody localized the keyword field. Tracking is per **storefront** — a
country plus the language its listing is written in — not per app.

- `AppLocale` declares the storefronts. Exactly one is primary; the app's headline numbers,
  identity, and header all follow it, so a German sync can't rename the app.
- Listing capture iterates every storefront. One unavailable country is recorded and skipped — an
  app is routinely absent from some markets — and only a total failure is an error.
- The **Localization** tab is a coverage matrix. The important state is not filled-vs-empty but
  **`same`**: text byte-identical to the primary in a different-language market means the listing
  was never actually localized.
- That case is called out rather than scored. The deterministic audit measures whether fields are
  *used*, not whether they are in the right language, so an untranslated storefront would
  otherwise score as well as a translated one. It shows **Not localized** instead of a number.
- Metadata generation targets a storefront: it writes in that locale, against keywords tracked in
  *that country*, and is told the limit counts characters rather than bytes.

---

## Metadata change impact

The feature the data model exists for. `StoreListing` rows are written only when the listing text
actually changes, so consecutive rows are a change log — the **Changes** tab turns that into
"you rewrote the subtitle on the 3rd, and here is what moved afterwards."

- Each change is compared against **the same number of days before and after**, so a steady
  upward trend does not read as the effect of every edit.
- The change day itself is excluded from both windows — a listing edited mid-day produces a
  partial day on each side.
- Version-only changes are flagged **cosmetic**, so a release is not mistaken for an experiment.
- Mean keyword rank compares **only keywords present on both sides**; a keyword added after the
  edit would otherwise skew the average. Null ranks ("outside the scanned results") are excluded
  rather than counted as 100.
- A change with fewer than 5 days of data after it is shown but marked **too early** — hiding it
  would leave the timeline empty exactly when someone goes looking.

Computed on demand rather than stored, so it is never stale.

---

## Public API

Create a key in Settings; it is shown once and only its SHA-256 is stored. `GET /api/v1` is a
self-documenting index.

```bash
curl http://localhost:3000/api/v1/apps -H "Authorization: Bearer aso_…"
```

Read-only, 120 requests per minute per key. Endpoints: `/apps`, `/metrics`, `/keywords`,
`/keywords/history`, `/reviews`, `/insights`. Every response is scoped to the key's organization —
requesting another tenant's app id returns 404, not 403, so the API does not confirm that the id
exists.

```bash
npm run smoke:api
```

---

## Alert delivery

`AlertRule.channels` accepts a webhook URL and a list of email addresses.

- **Slack** and **Discord** incoming webhooks are detected by URL and sent the body they expect.
- Anything else receives the JSON payload, signed: `X-ASO-Signature: sha256=…` over
  `` `${X-ASO-Timestamp}.${rawBody}` ``. The timestamp is inside the signed value so a captured
  delivery cannot be replayed. The secret is derived per organization from `ENCRYPTION_KEY` — it
  is not stored, and rotating that key rotates every webhook secret.
- **HTTPS is required** for anything leaving the machine; plain HTTP is accepted only for
  loopback, which is how a self-hosted receiver on the same box is reached.
- Email needs `EMAIL_SERVER` and `EMAIL_FROM`. Without them the email channel reports that it was
  skipped rather than failing the whole delivery — the webhook may still have worked.
- Channels are independent and each outcome is recorded on the event, so an alert that fired but
  never reached anyone is distinguishable from one that never fired. **Test** sends a marked test
  event and delivers it inline, so the delivery error lands in front of you instead of in a log.

```bash
npm run smoke:alerts
```

---

## Data model notes

- **Multi-tenant by organization.** Every business row hangs off `Organization`; `orgProcedure`
  resolves the tenant from membership and re-verifies it — the active-org cookie is a hint, never
  an authorization.
- **One metric table.** `MetricPoint` is `(app, date, source, metric, dimension) → value`, so
  revenue per install across Firebase and Play Console is a join rather than a spreadsheet.
  Dimensions are stable strings (`country=us|campaign=123`).
- **Listings are a change log.** A `StoreListing` row is written only when the text hash changes,
  which is what makes metadata edits joinable against rank and conversion movement.
- **`SyncRun` records every job**, including the failures, with records read/written and duration.
  Visible at the bottom of the Integrations page.

---

## Migrations

`prisma/migrations/0_init` is the baseline, generated from the schema and marked applied against
the existing database. `npm run db:deploy` is therefore a real deployment path, not an empty one.

A baselined migration that has only ever been *marked* applied is unproven — it may not actually
run. `verify:migration` creates a scratch database, applies the migration to it for real, then
diffs the result against the schema and asserts the diff is empty:

```bash
npm run verify:migration
```

Use `db:push` for local iteration and `migrate dev` when changing the schema for real; only
`migrate deploy` should ever touch production.

> CLI configuration lives in `prisma.config.ts`, not the `prisma` key in package.json (deprecated,
> removed in Prisma 7). A config file stops the CLI auto-loading `.env`, so the config loads it
> explicitly — without that, every command fails with "Environment variable not found:
> DATABASE_URL" despite `.env` being present.

## Public site

Everything under `src/app/(marketing)` is public and unauthenticated: home, benefits, showcase,
about, contact, blog, privacy and terms. The signed-in app lives in `src/app/(app)` and is
untouched by it.

Signed-in visitors are **not** redirected away from `/`. The blog and marketing pages are things a
customer may want to read while logged in; the header swaps its action to "Dashboard" instead.

### Editing the copy

`src/content/site.ts` holds nav, hero, feature cards, benefits, integrations, showcases,
testimonials, clients, pricing, FAQ and about copy. Editing the pitch does not mean editing
components.

### Brand palette

The public site runs the IndexForge orange, the app keeps its blue. The switch is one attribute —
`data-surface="marketing"` on the marketing layout — which redefines `--accent` for that subtree
in `globals.css`.

It is scoped rather than global on purpose: `--accent` doubles as a chart series colour in the
product, and a brand hue there would collide with the validated dataviz palette. This way the
landing page carries the brand and every chart keeps the hue it was designed around.

**Two oranges, deliberately.** `BRAND.base` (`#ff5722`) is the brand colour and never sits behind
text — white on it is 3.16:1. `BRAND.action` (`#d1471c`) is the same hue deepened until white
clears 4.5:1, and is what every button fill uses. A test enforces the split. Full detail in
[docs/HANDOVER.md §18](docs/HANDOVER.md).

### Product mockups

The screenshots on the marketing pages are not screenshots. `src/components/marketing/mockups/`
renders them as real DOM and inline SVG, so they reflow at any width, follow the theme, stay crisp
on any display, and cannot drift out of date the way an exported PNG of last quarter's UI does.
All values are hardcoded and deterministic — no randomness, so the server and client render
identically and never hydration-mismatch.

### The placeholder rule

Client logos, testimonials, case-study figures and the contact details are marked
`placeholder: true` until they are real. Anything so marked renders behind a visible **Sample
content** notice, placeholder case studies are set `noindex` and excluded from the sitemap, and
placeholder social links are omitted from the `Organization` JSON-LD rather than published as
profiles we do not own.

A test enforces the marking. An unmarked invented testimonial on a public page is a fabricated
endorsement rather than a layout stand-in — delete the flag only when the entry is genuinely true.

### Blog

Posts are MDX files in `content/blog`, with required frontmatter (`title`, `description`, `date`,
plus optional `tags`, `author`, `draft`). A post missing a required field throws at read time
rather than rendering as a blank card with a broken sitemap entry.

Drafts are visible in development and hidden in production. `src/lib/blog.ts` is deliberately a
small interface, so moving to database-backed posts later means replacing that module rather than
every page that reads a post.

Routes: `/blog`, `/blog/[slug]`, `/blog/tag/[tag]`, and an RSS feed at `/blog/rss.xml`.

### Contact form

A real form, not a `mailto:`. Messages are stored in `ContactMessage`, validated by a schema in
`src/lib/contact-schema.ts` that is shared by the client and the router so the two cannot drift.

Protection is a hidden honeypot field plus two rate limits: **3 per hour per email address** and
**20 per hour per IP**. The split matters — an office behind one NAT address would otherwise see
its third colleague refused, which looks like the product is broken. IPs are stored hashed, since
recognising a repeat sender does not require being able to identify them afterwards.

Email delivery is optional (`EMAIL_SERVER`, `EMAIL_FROM`, `CONTACT_EMAIL_TO`). Without it the
message is still saved, and the success screen says plainly that nobody has been notified rather
than implying a reply is on its way.

```bash
npm run dev          # in another terminal
npm run smoke:site
```

That checks every public route for a 200, a title, a description, a canonical URL and exactly one
`h1`; the RSS feed, sitemap and robots.txt; that placeholder case studies are labelled and
`noindex`; that unknown slugs 404; and that the contact endpoint accepts, validates, honeypots and
rate-limits correctly. It cleans up its own rows.

---

## Where a number comes from

Two opposite failure modes live here, and telling them apart is the whole job.

**Same money, described twice.** GA4 for Firebase reports ad revenue that AdMob also reports, and
in-app purchase revenue the store consoles also report. Those land as separate `MetricPoint` rows
(correctly — `source` is part of the unique key, so each provider's figure is worth keeping), but
**summing them reports roughly double the real number**.

**Different money, same measure.** Google Ads and Apple Search Ads both report spend, but it is
different spend on different networks. **Dropping either understates the total** — the exact
mirror of the double count.

`src/server/metrics/precedence.ts` models both as ranked **tiers**. The first tier with any data
wins and the rest are discarded; sources *within* a winning tier are additive. So ad revenue is
`[[AdMob], [Firebase]]` — one or the other — while spend is `[[Google Ads, Apple Search Ads]]` —
both, summed. Campaign impressions and store-listing impressions sit in different tiers, because
they are different measurements that happen to share a name.

Applied at query time in `summary`, `series`, `breakdown` and `byApp` — never at write time, so
raw per-source rows stay available for export and debugging. Ordering within the exclusive case is
"closest to the money wins": the system that processes the transaction beats an analytics SDK
observing it. The choice is made once across the whole query window, not per day, so two providers
measuring subtly different things never draws a step change into a chart that never happened.

Every `MetricKey` has a declared rule, enforced by a test — an unruled contested metric would
silently resume double-counting.

Collapsing across days and campaigns is a separate decision, declared per metric as
`aggregation: "sum" | "average"` in `METRIC_META`. It is not inferred from the unit, because the
two do not line up: ROAS is a percent that averages, CPI is a currency that averages, installs is
a number that sums. Inferring it meant every newly added ratio metric was silently summed.

```bash
npm run smoke:precedence
npm run smoke:derive
```

## Running the worker locally without Docker/WSL

The worker imports `server-only` modules, which throw when loaded outside a React Server
Component — normally an unnoticeable build-time guard, but it means the worker **cannot start**
under a plain `tsx` invocation. `scripts/allow-server-modules.cjs` stubs the guard for standalone
Node entry points (worker, seed, smoke tests) via `--require`; the real protection stays intact
in the Next.js build, which is what it exists to protect.

Redis has no official Windows installer that runs cleanly in every environment (the Memurai MSI's
custom actions can fail with `SFXCA: Failed to create temp directory`, error code 5). If that
happens, extract the package administratively — no install script runs, no service is created —
and run the binary directly:

```powershell
Start-Process msiexec.exe -ArgumentList "/a `"path\to\Memurai-Developer.msi`" /qn TARGETDIR=`".tools\memurai`"" -Wait
.tools\memurai\Memurai\memurai.exe --port 6379 --save ''
```

```bash
npm run worker
```

```bash
npm run smoke:worker
```

`smoke:worker` enqueues real jobs and waits for the worker to finish them, asserting on the
`SyncRun` rows the handlers write — including the case of a live network call to the App Store's
chart RSS feed.

## Commands

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run db:studio
```

```bash
npm run build
```

> Stop the dev server before building. `next dev` and `next build` both write to `.next`, and
> running them together corrupts the dev chunks (`Cannot find module './vendor-chunks/…'`). If
> that happens, delete `.next` and restart.

---

## Deployment

1. Provision Postgres and Redis.
2. `npm run db:deploy` (uses migrations; `db:push` is for development).
3. Deploy the web app with all env vars set. `APP_URL` must be the public origin — the Google
   OAuth redirect is derived from it.
4. Deploy the worker as a second process running `npm run worker`, or wire `/api/cron` to a
   scheduler.
5. Rotating `ENCRYPTION_KEY` invalidates every stored connection credential; connections flip to
   `NEEDS_REAUTH` rather than failing silently.

## Status

**Verified running.** Against a real Postgres with the seed data: sign-in, dashboard, per-app
overview, keyword rank tracking, reviews, integrations, settings, both themes, and a round-trip
mutation (API key created, hashed, listed). Typecheck and production build are clean; 29 unit
tests cover the deterministic ASO scoring, the Play Console CSV decoder and the credential
encryption.

**The integrations are wired but unverified against live accounts** — they need real credentials
to exercise. Expect to iterate on the Play Store HTML scraper in particular; Google reshuffles
that payload without notice, which is why the parser locates fields by shape rather than by a
fixed path.
