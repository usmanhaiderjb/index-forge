# IndexForge — engineering handover

Everything a developer needs to understand this codebase, judge whether it is ready to ship, and
put it on a server.

Written to be read top to bottom once, then used as a reference. Where something is unfinished or
unverified it says so plainly — a handover doc that only lists what works is worse than none,
because it moves the discovery of the gaps to production.

- **[1. What this is](#1-what-this-is)**
- **[2. Architecture](#2-architecture)**
- **[3. Repository map](#3-repository-map)**
- **[4. Data model](#4-data-model)**
- **[5. The rules that keep numbers correct](#5-the-rules-that-keep-numbers-correct)**
- **[6. Integrations](#6-integrations)**
- **[7. Background jobs](#7-background-jobs)**
- **[8. Public site and blog](#8-public-site-and-blog)**
- **[9. Security model](#9-security-model)**
- **[10. Configuration reference](#10-configuration-reference)**
- **[11. Local development](#11-local-development)**
- **[12. Testing](#12-testing)**
- **[13. Production readiness](#13-production-readiness)**
- **[14. Deployment](#14-deployment)**
- **[15. Operations](#15-operations)**
- **[16. Known gaps](#16-known-gaps)**
- **[17. Where to start](#17-where-to-start)**
- **[18. Brand](#18-brand)**

> Planning iOS and Android? See **[MOBILE-PLAN.md](MOBILE-PLAN.md)** — the backend prerequisites
> there are blocking, and doing them after the app is written means rewriting it.

---

## 1. What this is

**IndexForge** — an App Store Optimization platform. It connects the six accounts that hold an
app's numbers, pulls them into one daily table, tracks keywords and competitors, syncs reviews,
splits store traffic by where it came from, and generates listing suggestions that fit each
store's character limits.

The positioning is in the name and it drives the copy: the product's claim is that store
visibility is **built**, not observed. Everything user-facing should read as a workshop
instruction rather than a report — "Stop tracking rankings. Start forging them.", not "Track your
rankings".

> The npm workspaces are still named `@aso/*` and the tagline lives in `src/content/site.ts`.
> Internal package names were deliberately left alone: renaming them touches every import in three
> apps for no user-visible gain. `SITE.name` is the single source of the product name.

Two surfaces in one Next.js app:

| Surface | Routes | Auth |
| --- | --- | --- |
| Public marketing site and blog | `/`, `/benefits`, `/showcase`, `/about`, `/contact`, `/blog/**`, `/privacy`, `/terms` | none |
| The product | `/dashboard`, `/apps/**`, `/insights`, `/alerts`, `/integrations`, `/settings` | required |

Two processes. **Nothing syncs without the worker running** — the web app only enqueues.

---

## 2. Architecture

```
                       ┌──────────────────────────────┐
   browser ──────────► │  Next.js 15 (App Router)     │
                       │  ├─ (marketing)  public      │
                       │  ├─ (app)        authed RSC  │
                       │  ├─ /api/trpc    typed RPC   │
                       │  ├─ /api/v1      REST + key  │
                       │  └─ /api/cron    scheduler   │
                       └───────┬──────────────┬───────┘
                               │              │ enqueue
                         Prisma│              ▼
                               │        ┌──────────┐
                               │        │  Redis   │  BullMQ queue "aso"
                               │        └────┬─────┘
                               ▼             │ consume
                       ┌──────────────┐      ▼
                       │  Postgres    │◄─ ┌──────────────────────────┐
                       └──────────────┘   │  worker process          │
                                          │  connectors, scrapers,   │
                                          │  AI, alerts, digests     │
                                          └────────┬─────────────────┘
                                                   ▼
                            Firebase · AdMob · Google Ads · Play Console
                            App Store Connect · Apple Search Ads · Anthropic
```

**Why two processes.** A store scrape takes tens of seconds and most provider APIs rate limit. Run
that in a request and you block a web worker; run it in a background process and web and sync
scale independently.

**Stack.** Next.js 15 App Router · React 19 · tRPC v11 · Prisma 6 + Postgres 17 · BullMQ + Redis ·
Auth.js v5 · Tailwind v4 · Recharts · MDX · Anthropic SDK.

**Request path.** RSC pages call tRPC through a server-side caller (no HTTP hop). Client components
use `@trpc/react-query`. Procedures form an RBAC ladder:

```
publicProcedure → protectedProcedure → orgProcedure → memberProcedure → adminProcedure → ownerProcedure
```

`orgProcedure` resolves the caller's organization and every query is scoped by it. Tenant isolation
is enforced there rather than per-query, and `scripts/smoke-api.ts` asserts a foreign org's app is
not reachable.

---

## 3. Repository map

```
src/
  app/
    (marketing)/          public site — own layout, header, footer, brand palette
    (app)/                the product — auth-gated, app shell
    api/
      trpc/[trpc]/        tRPC HTTP handler
      v1/                 public REST, API-key authenticated
      cron/               external scheduler entry point
      health/             liveness + dependency check
      oauth/google/       OAuth start + callback
      export/             CSV/JSON export
    signin/               split-layout sign-in
    not-found.tsx         404
    sitemap.ts robots.ts  crawler files
  components/
    ui/primitives.tsx     the whole design system: Button, Card, Input, Badge…
    brand/logo.tsx        the mark and wordmark — see §18
    charts/               Recharts wrappers + validated dataviz palette,
                          traffic-funnel.tsx
    marketing/            public site sections, mockups, forms
  content/site.ts         ALL marketing copy, pricing, nav — edit here, not in JSX
  lib/                    server-coupled helpers: blog (filesystem), csv
  server/
    api/                  tRPC root, trpc.ts (procedures), routers/
    integrations/         six connectors behind one interface + registry
    aso/                  store scrapers, keyword scoring, provider interface
    aso/corpus.ts         global keyword corpus — see docs/KEYWORD-DATABASE.md
    aso/mining.ts         keyword mining from ranked apps' metadata
    aso/difficulty.ts     keyword difficulty, one model shared everywhere
    aso/frontier.ts       resumable crawl queue behind npm run corpus:build
    aso/research.ts       scoring behind /research — see docs/KEYWORD-DATABASE.md §10
    aso/clustering.ts     related terms and clustering — see §11
    ai/                   Anthropic client, prompts, schemas, error mapping
    jobs/                 queue, processor, handlers/
    metrics/              precedence.ts, derive.ts  ← read these first
    push/fcm.ts           Firebase Cloud Messaging — see docs/PUSH-PLAN.md
    auth.ts crypto.ts db.ts redis.ts notify/
  worker/index.ts         worker entry point
packages/shared/          @aso/shared — framework-free code shared with mobile
                          date, format/METRIC_META, dataviz + BRAND tokens,
                          dimension helpers, traffic sources, zod schemas
apps/mobile/              Expo app for iOS and Android — talks to tRPC over
                          bearer tokens, not cookies
apps/desktop/             Electron client for Windows and macOS — a window onto
                          a running server, holds no business logic
content/blog/*.mdx        blog posts
prisma/                   schema.prisma, migrations/, seed.ts
scripts/                  smoke tests, local Postgres, migration verifier,
                          generate-brand-assets.cjs
docs/                     this file, DEPLOYMENT notes
```

**The `content/site.ts` rule.** Every piece of marketing copy lives there. Editing the pitch should
never mean editing a component.

---

## 4. Data model

32 models. `prisma/schema.prisma` is heavily commented; the ones that carry design decisions:

**Tenancy.** `Organization` → `Membership` (role: OWNER/ADMIN/MEMBER/VIEWER) → `User`. Every
domain row hangs off an organization. `Invite` for onboarding, `AuditLog` for who did what.

**Apps.** `App` (one per store listing) → `AppLocale` (per-storefront), `StoreListing` (versioned
snapshots, content-hashed so an unchanged listing writes no row).

**Metrics.** `MetricPoint` is the centre of the system:

```prisma
@@unique([appId, date, source, metric, dimension])
```

`source` being part of the key is deliberate — two providers reporting the same metric produce two
rows, both kept, and aggregation decides which to believe at query time. `dimension` is `""` for
app-wide or a sorted `country=us|campaign=123` string.

**Keywords.** `Keyword` → `KeywordRank` (ours, daily) + `KeywordCompetitorRank` (theirs, from the
same scan) + `KeywordMetric` (market-side, weekly). Both rank tables store `scanDepth`, so a null
rank stays interpretable after someone changes the scan limit.

**Reviews.** `Review` with sentiment and topic classification, plus reply state.

**AI.** `AiInsight`, `AiRecommendation`, `MetadataSuggestion`, `AiUsage` (token accounting against
`AI_MONTHLY_TOKEN_BUDGET`).

**Delivery.** `AlertRule` → `AlertEvent` (with `deliveredAt`, `deliveryAttempts`, `deliveryLog`),
`Digest`, `ApiKey`, `ContactMessage`.

### Two schema traps worth knowing

**`ChartRank.category` is `String @default("overall")`, not nullable.** Postgres treats every NULL
in a unique index as distinct, so a nullable category would have inserted a duplicate overall-chart
row every single day and the unique constraint would never have fired.

**`MetricKey.ORGANIC_INSTALLS` is derived, never reported.** No store publishes it. See below.

---

## 5. The rules that keep numbers correct

If you read only one section, read this one. These are the parts most likely to be broken by a
well-meaning change.

### Source precedence — `src/server/metrics/precedence.ts`

Two providers reporting the same metric need **opposite** handling depending on what they mean:

| Case | Example | Correct behaviour |
| --- | --- | --- |
| Same money, described twice | AdMob and Firebase both report ad revenue | Pick one. Summing roughly doubles it. |
| Different money, same measure | Google Ads and Apple Search Ads both report spend | Sum. Dropping one understates the total. |

Modelled as **ranked tiers**. The first tier with any data wins and the rest are discarded; sources
*within* a tier are additive:

```ts
AD_REVENUE: [[ADMOB], [FIREBASE]]                    // one or the other
SPEND:      [[GOOGLE_ADS, APPLE_SEARCH_ADS]]         // both, added
IMPRESSIONS:[[GOOGLE_ADS, APPLE_SEARCH_ADS], [PLAY_CONSOLE]]
```

The impressions case shows why tiers must be ordered: campaign impressions add to each other, but
store-listing impressions are a different measurement that happens to share a name.

Two implementation rules:

- **Choose once across the query window, not per day.** Per-day selection fills gaps but switches
  sources mid-series, drawing a step change into the chart that never happened.
- **Apply at query time, never at write time.** Raw per-source rows must survive so "why did this
  number change?" has an answer.

A test asserts every `MetricKey` has a declared rule. An undeclared contested metric silently
resumes double-counting, and it looks like growth.

### Aggregation — `METRIC_META[...].aggregation` in `src/lib/format.ts`

How a metric collapses across days and campaigns is declared per metric, **not inferred from the
unit**. The two do not line up: ROAS is a percent that averages, CPI is a currency that averages,
installs is a number that sums. Inference meant every newly added ratio metric was silently summed.

### Traffic-source funnel — `metrics.funnel` in `src/server/api/routers/metrics.ts`

Store traffic split into `search` / `browse` / `referral` / `other`, filed under the `source=`
dimension. The vocabulary and the provider mapping live in `packages/shared/src/traffic.ts`.

Three rules, each with a plausible wrong implementation:

- **A conversion rate is computed, never aggregated.** The procedure sums the counters and divides
  once at the end. Averaging the stored daily `CONVERSION_RATE`, or averaging across sources,
  gives the mean of a set of ratios, which is not the ratio of the totals: a day of 1/100 and a
  day of 9/10 is 10/110 = 9.09%, not the 45.5% the mean produces. No `CONVERSION_RATE` row is ever
  written per source for this reason.
- **Only `source=` rows are read.** App-wide rows carry the same numbers undivided, and country
  rows slice them a different way. Mixing any two of the three double-counts.
- **An unrecognised source becomes `other`, never dropped.** A dropped row makes the funnel
  silently fail to add up; a bucket labelled "Other" is visible and therefore correctable.

This is **not** the paid/organic split. That comes from the ad networks and is attributed on their
terms and windows; this is what the store says about its own traffic. The two overlap, disagree,
and must never be added together.

Emitted by **both** store connectors. Play Console reads a monthly CSV
(`store_performance_*_traffic_source.csv`). App Store Connect uses the Analytics Reports API, which
is a different thing entirely from the Sales & Trends reports the rest of that connector uses:

- **It is asynchronous.** You register an ongoing *request*, and Apple publishes the first daily
  instance **up to 48 hours later**. A new connection returning nothing is the expected state, not
  a failure — `AnalyticsAvailability` exists so the caller can tell "not ready" from "broken".
- **Four hops**: `analyticsReportRequests` → `reports` → `instances` → `segments`, ending at
  pre-signed URLs holding gzipped TSV. Those URLs must be fetched **without** an Authorization
  header; Apple rejects a signed URL that also carries a bearer token.
- **The request is resolved once per sync** and shared by both reports. Resolving it inside each
  report fetch raced two POSTs and registered two ongoing requests for the same app — caught by
  the smoke test, which asserts exactly one is created.
- **`INSTALLS` counts first-time downloads only.** The App Downloads report separates those from
  redownloads, auto-downloads to a second device and restores. In the fixture the redownloads
  outnumber installs 5300 to 812; counting them would make Apple search look seven times better
  than it is.
- **Columns are resolved through aliases**, not fixed header strings. Apple renames these without
  versioning, and an exact match turns a rename into silent data loss: the parse succeeds, every
  row yields zero, and the funnel reports that nobody found the app through search. A missing
  column skips the row rather than counting it as zero.

```bash
npm run smoke:asc-analytics   # the whole flow against a stubbed Apple, 12 checks
```

**Unverified:** no Apple account was available. The smoke test proves the traversal, the gzip
handling, the column resolution and the metric mapping. It does not prove that Apple's real column
names match the aliases in `COLUMN`, which is the most likely thing to need adjusting on first
contact with a live account.

### Derived organic installs — `src/server/metrics/derive.ts`

`organic = total − paid`, with three traps:

1. **De-duplicate the total first.** Otherwise you subtract paid from a double-counted total.
2. **Only derive inside the paid-data span.** An ad account connected six months ago and dark since
   still has paid rows; checking "is there paid data anywhere" would declare last week's installs
   fully organic. Ad platforms omit zero-spend days, so a gap *inside* the reported span is a real
   zero; outside it, nothing is known.
3. **Floor at zero and record it.** Attribution windows let a network claim more installs than the
   console counted. `meta.floored = true` preserves the discrepancy instead of hiding it.

Stale derived rows in the window are deleted, not left behind — an upsert alone orphans rows when a
correction shrinks the span.

### Date handling — `src/lib/date.ts`

Store APIs send `2026-08-01` meaning that calendar day. `parseISO` reads it as **local** midnight,
which on any host east of UTC converts to July 31 — shifting every metric a day earlier, invisibly.
`toUtcDate` parses date-only strings as UTC explicitly. Seven tests pin this.

### Chart gaps

Trailing unsynced days are **trimmed**, interior gaps are zero-filled. Zero-filling to today draws
a catastrophic crash every morning before the sync runs.

---

## 6. Integrations

Six connectors behind one interface (`src/server/integrations/types.ts`), resolved through
`registry.ts`. Adding a seventh means implementing `Connector` and adding one registry line.

| Provider | Auth | Provides |
| --- | --- | --- |
| Firebase / GA4 | Google OAuth | DAU/MAU, sessions, retention, crash-free, revenue |
| AdMob | Google OAuth | Ad revenue, eCPM, fill rate, impressions |
| Google Ads | Google OAuth + developer token | Spend, paid installs, CPI, CPC, ROAS |
| Play Console | Google OAuth | Installs, uninstalls, conversion, reviews |
| App Store Connect | ES256 JWT from `.p8` | Units, proceeds, reviews, ratings |
| Apple Search Ads | OAuth client-credentials, JWT secret | Spend, paid installs, CPI, CPC |

**Apple has two separate credentials.** App Store Connect and Search Ads use different consoles,
different `.p8` keys and different audiences. The Search Ads assertion is signed for
`https://appleid.apple.com`; signing it for the ASC audience produces a well-formed token Apple
rejects with a generic `invalid_client`. The connect form rejects an ASC key up front rather than
letting that happen later.

**Play Console install stats are not a REST endpoint.** They are CSV in a private Cloud Storage
bucket. The bucket id is entered per app when linking.

**Review replies are the one write path.** They publish public, user-visible content, so they must
not retry blindly — a timeout that gets retried becomes two published replies. Read paths retry
freely; this one fails loudly.

**Keyword data is scraped, not licensed.** Neither store publishes a keyword API. `ASO_PROVIDER`
switches to a paid provider (AppTweak) for calibrated volume. The built-in difficulty score is an
explicit model, not a measurement — stable and comparable across terms, which is what
prioritisation needs. The public site says this out loud; keep it that way.

---

## 7. Background jobs

One BullMQ queue, `aso`. `src/server/jobs/queues.ts` defines the `JobData` union; the processor
switch is exhaustive by design, so a new job type cannot be added without handling it.

| Job | Trigger | Does |
| --- | --- | --- |
| `connection.sync` | 6-hourly, manual | Pull metrics and reviews for every linked app |
| `connection.discover` | on connect | List linkable resources, auto-match by store id |
| `app.listing` | 12-hourly | Snapshot the store listing |
| `app.ranks` | daily | Keyword rank + competitor positions |
| `app.charts` | daily | Category and top-chart positions |
| `app.derive` | after sync, daily | Organic installs |
| `app.reviews` | as needed | Review sync |
| `app.competitors` | daily | Snapshots + auto-discovery |
| `review.classify` | on ingest | Sentiment and topics |
| `ai.insights` | daily | Insight generation |
| `alerts.evaluate` | :15 and :45 | Rule evaluation |
| `alert.deliver` | on trigger | Webhook + email |
| `digest.send` | per schedule | Scheduled digests |
| `schedule.tick` | hourly | Fans out per-tenant work |

**Scheduling.** `schedule.tick` fans out so repeat definitions stay static while the tenant list
changes. Work is spread across the hour by a stable hash of the id, so a hundred organizations do
not hit the App Store in the same second.

**Idempotency.** `enqueue` derives a deterministic `jobId`, so a user mashing "sync now" queues one
job, not five.

**Redis down.** The request-path client fails fast (`maxRetriesPerRequest: 2`, 5s command timeout)
and `enqueue` translates the failure into `QueueUnavailableError` with a message naming the one
thing that stopped working. Everything read-only keeps serving. The worker uses a separate
unbounded-retry connection, because it blocks on Redis by design.

**`server-only` and the worker.** Handlers import `server-only`, which throws outside a React
Server Component — it stops the worker booting at all. `scripts/allow-server-modules.cjs` is
preloaded via `--require` to neutralise it. Every worker-side script needs that flag; the npm
scripts already carry it.

---

## 8. Public site and blog

**Palette scoping.** `data-surface="marketing"` on the marketing layout redefines `--accent` to
the brand orange for that subtree. It is scoped rather than global because `--accent` doubles as a
chart series colour in the product, and a brand hue there would collide with the validated dataviz
palette. See §18 for the brand tokens themselves.

**Mockups are DOM, not screenshots.** `src/components/marketing/mockups/` renders the product
illustrations as HTML and inline SVG — they reflow at any width, follow the theme, and cannot go
stale the way an exported PNG does. All values are hardcoded and deterministic, so server and
client render identically and never hydration-mismatch.

**Blog.** MDX in `content/blog/`, frontmatter `title`/`description`/`date` required (a missing
field throws at read time rather than rendering a blank card and a broken sitemap entry), plus
optional `tags`/`author`/`draft`. Drafts are visible in development, hidden in production.
`src/lib/blog.ts` is a small interface so a move to DB-backed posts replaces that module rather
than every page.

**Contact form.** Real form, stored in `ContactMessage`. Honeypot field plus two rate limits: 3/hour
per email address, 20/hour per IP. The split matters — one office behind a NAT address would
otherwise see its third colleague refused. IPs are stored hashed.

### The placeholder rule

Client logos, testimonials, case-study figures, pricing and contact details are flagged
`placeholder: true` in `content/site.ts`. Flagged content renders behind a visible **Sample
content** notice; placeholder case studies are `noindex` and excluded from the sitemap; placeholder
social links are dropped from the `Organization` JSON-LD.

Tests enforce this, including one that fails if any client name contains a well-known brand. An
unmarked invented testimonial on a public page is a fabricated endorsement, and real company logos
are not ours to publish. **Do not delete a flag to tidy the design — delete it when the content
becomes true.**

---

## 9. Security model

| Concern | Implementation |
| --- | --- |
| Credentials at rest | AES-256-GCM, `v1.<iv>.<tag>.<ciphertext>`, key from `ENCRYPTION_KEY` |
| Credentials to browser | never — decrypted only in the worker that calls the provider |
| Sessions | Auth.js v5, JWT strategy, PrismaAdapter |
| Tenant isolation | `orgProcedure` scopes every query; asserted by `smoke:api` |
| Public REST | `ApiKey` with hashed storage, revocable |
| Webhooks | HMAC-SHA256 over `${timestamp}.${rawBody}`, per-org secret derived from `ENCRYPTION_KEY` |
| CSV export | formula injection prevented — `=`, `+`, `-`, `@` prefixed with `'` |
| Cron endpoint | `CRON_SECRET` bearer token, constant-time compare |
| Contact form | honeypot, dual rate limit, hashed IP |
| Headers | `nosniff`, `DENY` framing, strict referrer, restrictive Permissions-Policy |

**`ENCRYPTION_KEY` rotation is not implemented.** Changing it makes every stored credential
undecryptable and every connection needs reconnecting. If you need rotation, that is real work:
add a key id to the ciphertext prefix and support decrypting with the previous key.

---

## 10. Configuration reference

`.env.example` is the canonical list. `src/env.ts` validates at build and boot — a bad value fails
fast rather than at first request.

### Required

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | ≥16 chars. `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | Exactly 32 bytes base64. `openssl rand -base64 32` |

### Strongly recommended in production

| Variable | Default | Notes |
| --- | --- | --- |
| `APP_URL` | `http://localhost:3000` | Canonical URLs, OG tags, sitemap, email links |
| `REDIS_URL` | `redis://localhost:6379` | No queue without it |
| `AUTH_URL` | — | Set when behind a proxy |
| `AUTH_TRUST_HOST` | — | `true` behind a reverse proxy |
| `CRON_SECRET` | — | Required to use `/api/cron` |
| `NODE_ENV` | `development` | **Must be `production`** |

### Optional by feature

| Feature | Variables |
| --- | --- |
| Google sign-in | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |
| Google integrations | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| Google Ads | `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` |
| AI | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_MODEL_BULK`, `ANTHROPIC_EFFORT`, `AI_MONTHLY_TOKEN_BUDGET` |
| Paid ASO data | `ASO_PROVIDER`, `APPTWEAK_API_KEY` |
| Scraper politeness | `ASO_USER_AGENT`, `ASO_SCRAPE_DELAY_MS` (default 1200ms) |
| Email | `EMAIL_SERVER`, `EMAIL_FROM`, `CONTACT_EMAIL_TO` (read from `process.env`, not `src/env.ts`) |

`RUN_INLINE_WORKER=true` runs jobs in the web process. Convenient for a demo; **do not use it in
production** — a long scrape blocks a request thread.

---

## 11. Local development

```bash
npm install
npm approve-scripts prisma @prisma/client @prisma/engines esbuild unrs-resolver
cp .env.example .env
```

Generate the two secrets and paste them into `.env`:

```bash
openssl rand -base64 32
```

**With Docker:**

```bash
docker compose up -d
```

**Without Docker** — Postgres runs from `node_modules`, data in a gitignored `.localdb/`:

```bash
npm run localdb
```

Leave it running. `npm run localdb:reset` wipes and starts over. Redis still has to come from
somewhere; on Windows without Docker, Memurai works (see README).

Then:

```bash
npm run db:deploy
npm run db:seed
```

Two terminals:

```bash
npm run dev
```

```bash
npm run dev:worker
```

Sign in at `/signin` with `founder@example.com` — the dev credentials provider is never registered
in production.

> **Do not run `next build` while `next dev` is running.** They share `.next` and it corrupts,
> producing mystery 500s. If the dev server starts behaving impossibly, delete `.next` and restart.

---

## 12. Testing

```bash
npm run typecheck    # tsc --noEmit
npm test             # 353 unit tests, no DB or network
```

Smoke tests run against real infrastructure. Postgres and Redis must be up; some need the dev
server or the worker.

```bash
npm run verify:migration      # migrations replay onto an empty DB with no drift
npm run smoke:precedence      # proves revenue is counted once
npm run smoke:derive          # organic install derivation, 12 checks
npm run smoke:competitor-ranks# rank capture + head-to-head API, 14 checks
npm run smoke:search-ads      # Apple Search Ads connector against stubbed Apple
npm run smoke:asc-analytics   # ASC Analytics Reports traffic source, 12 checks
npm run smoke:push            # push campaign fan-out, real DB + stubbed Firebase, 15 checks
npm run smoke:api             # REST API, tenant isolation, export, revocation
npm run smoke:alerts          # rule evaluation + real signed webhook delivery
npm run smoke:worker          # proves the queue actually drains (worker required)
npm run smoke:site            # every public route, feeds, crawler files, contact form
npm run smoke:mobile          # device tokens: rotation, replay detection, revocation
npm run smoke:mobile-api      # composed mobile endpoints, account deletion guard rails
npm run smoke:ai              # AI paths (needs Anthropic credits — see gaps)
```

Some smoke tests mutate seeded data and say so on exit. Re-run `npm run db:seed` afterwards.

**Where the tests are deliberately strict.** Source precedence, the organic/paid split, date
handling, store character limits, the marketing placeholder rule, the traffic-funnel arithmetic
(a rate must be computed from summed counters, never averaged across days) and brand contrast
(§18). Those are the places where a wrong answer looks plausible — a chart still renders, a button
still has a label, and nothing tells you the number or the colour is unusable.

---

## 13. Production readiness

Work through this before taking traffic.

### Blocking

- [ ] `NODE_ENV=production`, real `APP_URL`, `AUTH_TRUST_HOST=true` behind a proxy.
- [ ] Fresh `AUTH_SECRET` and `ENCRYPTION_KEY`. **Never reuse the development values.**
- [ ] Rotate any credential that has ever been pasted into a chat, ticket or log.
- [ ] `npm run db:deploy` — never `db:push` against production.
- [ ] Worker process actually running. Confirm with `npm run smoke:worker` or the queue counts on
      `/api/health`.
- [ ] Postgres backups configured and a restore rehearsed. Nothing here backs itself up.
- [ ] TLS terminated in front of the app.
- [ ] Replace `content/site.ts` placeholder content, or accept the visible "Sample content" notices.
- [ ] Set real pricing, or remove the pricing section.
- [ ] Have a lawyer replace `/privacy` and `/terms`. Both say in-page that they are not reviewed.
- [ ] Set `EMAIL_SERVER`/`EMAIL_FROM`/`CONTACT_EMAIL_TO`, or accept that contact messages are only
      stored and nobody is notified. The success screen already says so.

### Strongly recommended

- [ ] Error tracking (Sentry or equivalent). There is none.
- [ ] Log aggregation. The worker logs to stdout.
- [ ] Uptime check against `/api/health` — it returns 503 when Postgres or Redis is unreachable.
- [ ] A rate limit in front of `/api/trpc` and `/api/v1`. Only the contact form limits itself.
- [ ] Redis persistence (`appendonly yes`) so queued jobs survive a restart.
- [ ] `AI_MONTHLY_TOKEN_BUDGET` set to something you are willing to be billed for.
- [ ] Decide the scraper's politeness. `ASO_SCRAPE_DELAY_MS` defaults to 1200ms; aggressive
      scraping gets IPs blocked and may breach store terms.

### Known non-blocking issues

- `npm run lint` does not work. `next lint` is deprecated and wants interactive setup. Migrate with
  `npx @next/codemod@canary next-lint-to-eslint-cli .`
- No `SECURITY.md`, no dependency scanning in CI, no CI at all.

---

## 14. Deployment

### Option A — Docker Compose on one host

Fastest path to something real. Web, worker, Postgres and Redis on one machine.

```bash
cp .env.example .env.production      # then edit it properly
docker compose -f docker-compose.prod.yml up -d --build
```

What the compose file does:

- `migrate` runs `prisma migrate deploy` once and exits. `web` and `worker` both wait for it to
  complete successfully, so no process ever serves traffic against a schema it was not built for.
- `postgres` and `redis` are not published to the host — only the app containers reach them.
- `web` health check hits `/api/health`, which reports dependency state rather than just process
  liveness.
- Scale workers independently: `docker compose -f docker-compose.prod.yml up -d --scale worker=3`.
  BullMQ distributes across every worker on the queue.

Put a TLS-terminating reverse proxy (Caddy, nginx, Traefik) in front of `web`.

> **What is verified.** The image builds (350 MB) and the full compose stack runs: Postgres and
> Redis healthy, `migrate` exits 0 with all migrations applied, the worker logs
> `listening on "aso" concurrency=4 env=production`, and `/api/health` returns `{"ok":true}` with
> both dependencies up. Three problems were found and fixed getting there — a missing
> `.dockerignore` (which let a host `node_modules` overwrite the Alpine one, baked `.env` into a
> layer, and dragged 5.6 GB of context), a missing `public/` directory, and `APP_URL` being
> undefined during the build because `skipValidation` bypasses zod defaults. See `DEPLOYMENT.md`
> §8. Not exercised: connecting a real integration from inside a container.

### Option B — Platform (Railway, Render, Fly, ECS)

Deploy the same image twice with different commands:

| Service | Command | Notes |
| --- | --- | --- |
| web | `node server.js` | Needs a port, scales on traffic |
| worker | `node_modules/.bin/tsx --require ./scripts/allow-server-modules.cjs src/worker/index.ts` | No port, scales on queue depth |

Run `npx prisma migrate deploy` as a release/pre-deploy step. Add managed Postgres and Redis.
**Redis must not be an eviction-policy cache** — evicting queue keys loses jobs. Use
`noeviction`.

### Option C — Vercel

The web app deploys cleanly. The worker does not — Vercel has no long-lived processes. Either:

- Run the worker elsewhere (a small VM, Railway, Fly) pointed at the same Redis, **or**
- Drive `/api/cron` from Vercel Cron and accept that it only *enqueues*. Something still has to
  drain the queue. `RUN_INLINE_WORKER=true` makes the web process drain it, which works for light
  loads and will time out on a real store scrape.

```
POST /api/cron?job=tick    Authorization: Bearer $CRON_SECRET
POST /api/cron?job=alerts  Authorization: Bearer $CRON_SECRET
```

### First deploy checklist

1. Provision Postgres and Redis; note the URLs.
2. Set every required variable from §10.
3. `npx prisma migrate deploy`.
4. Do **not** seed production. `prisma/seed.ts` writes demo apps and fabricated metrics.
5. Start web, confirm `/api/health` returns 200.
6. Start worker, confirm `npm run smoke:worker` passes or the queue drains.
7. Sign in, connect one integration, trigger a manual refresh, confirm rows land.
8. Point a monitor at `/api/health`.

---

## 15. Operations

**Health.** `GET /api/health` → 200 with per-dependency detail and queue counts, 503 when Postgres
or Redis is down.

**Queue stuck.** Check the worker is alive, then Redis. `queueHealth()` reports waiting/active/
delayed/failed/completed. Failed jobs are retained 7 days, completed 24 hours.

**A number looks wrong.** In order: which source is it? (`summary` returns `sources`.) Is the
window right — stores restate the last few days. Then check `MetricPoint` for that
`(appId, date, metric)` across sources: two rows means precedence chose one, and
`src/server/metrics/precedence.ts` says which.

**Charts dropped to zero.** Almost always the sync did not run. Trailing days are trimmed, so a
literal zero means a zero was written.

**A connection went `NEEDS_REAUTH`.** The grant was revoked upstream, or an Apple key was rotated.
Reconnect from `/integrations`.

**AI stopped working.** `describeAiError` maps billing/auth/rate-limit/overload into actionable
messages. Check `AiUsage` against `AI_MONTHLY_TOKEN_BUDGET` first.

**Backups.** Postgres holds everything except the queue. Redis holds in-flight jobs; losing it
loses queued work but no history. Back up Postgres; treat Redis as recoverable.

**Adding a metric.** Add to the `MetricKey` enum → migrate → add to `METRIC_META` (label, unit,
group, `aggregation`) → add a `SOURCE_PRECEDENCE` rule. The last one is enforced by a test; the
others will surface as type errors.

---

## 16. Known gaps

Stated plainly so nobody discovers them in production.

**Verification.**

- **No connector has ever run against a live account.** All six are proven against stubbed
  endpoints and fixtures. Expect real-world schema surprises, especially Play Console CSV and the
  Apple report shapes.
- **AI features are unverified.** The Anthropic account used during development had no credits, so
  `npm run smoke:ai` has never passed. The code paths, schemas and error mapping are written and
  unit-tested; the round trip is not proven.
- **The Docker image has never been built.** The Next build it wraps is verified; the image is not.
  See §14.

**Missing.**

- No CI pipeline, no error tracking, no metrics/APM.
- No rate limiting on tRPC or the v1 REST API.
- No `ENCRYPTION_KEY` rotation path.
- No soft delete or data-retention policy; deletes cascade immediately.
- No multi-region or read-replica support.
- `npm run lint` is broken (deprecated `next lint`).

**Content.**

- Pricing, testimonials, client logos and contact details are placeholders, visibly marked.
- Privacy and terms are descriptive, not lawyer-reviewed. Both say so on the page.

**Product.**

- Keyword difficulty is a model, not measured volume, unless a paid provider is configured.
- Review reply length limits are known for Apple and Google; a third store would need its own.
- Organic install derivation needs an ad account connected. Without one the split is withheld —
  correct, but users will ask why it is blank.

---

## 17. Where to start

If you are new to this codebase, in this order:

1. **`prisma/schema.prisma`** — the domain, with the reasoning in comments.
2. **`src/server/metrics/precedence.ts`** — the single most important file. Understand tiers.
3. **`src/server/metrics/derive.ts`** — how a derived metric is computed honestly.
4. **`src/server/integrations/types.ts`** — the connector contract, then any one connector.
5. **`src/server/jobs/queues.ts` and `processor.ts`** — how work actually happens.
6. **`src/server/api/trpc.ts`** — the RBAC ladder and tenant scoping.
7. **`content/site.ts`** — all marketing copy and the placeholder rule.
8. **`packages/shared/src/tokens.ts`** — the brand palette, and why two of the oranges exist (§18).

Then run `npm test` and read the test names. They document the failure modes this system was built
to avoid, which is faster than reading the implementations.

**The one principle to preserve:** a wrong number is worse than no number. Metrics with no source
report as having no data, never as zero. Derived figures are withheld when their inputs are
missing rather than estimated. Every figure records where it came from. Several tests exist purely
to keep that true — if one starts failing, the answer is almost never to relax the test.

---

## 18. Brand

The identity is **dark-first**. It was designed for Forge Obsidian, where Slate White reads at 17:1
and Molten Orange at 5.6:1. On a light background the same accents fail WCAG AA, so several tokens
are derived variants rather than the raw brand hexes. All of them live in
`packages/shared/src/tokens.ts` and are pinned by `packages/shared/src/__tests__/brand-contrast.test.ts`.

| Name | Hex | Use |
| --- | --- | --- |
| Forge Obsidian | `#0f172a` | Dashboard grounds, the icon plate, dark panels |
| Molten Orange | `#ff5722` | The brand colour. Marks, badges, accents — **never behind text** |
| Steel Blue | `#3b82f6` | Data accent: links, active states, the index bars in the mark |
| Slate White | `#f8fafc` | Type and surfaces on dark |

### The two oranges, and why

`BRAND.base` is Molten Orange exactly as specified. `BRAND.action` (`#d1471c`) is the same hue
deepened until **white** text on it clears 4.5:1.

This split exists because white on `#ff5722` is **3.16:1** — a WCAG AA failure on the most-clicked
text in the product. Deepening only the interactive fill keeps the brand colour untouched
everywhere it is not a background for words.

**Do not collapse these two tokens.** A test asserts white is never placed on `BRAND.base`, and
that `action` and `base` differ. If that test starts failing, the fix is not to relax it.

The same rule applies per surface:

- `--accent` on the marketing surface is `action`, not `base`.
- The mobile portfolio card uses `t.brand.action`, because every label on it is white. It was
  `base` and was 3.16:1 until the split.
- `ink` / `inkDark` are for orange *as text* — `#cc461b` on light (4.50:1), `#ff7043` on obsidian
  (6.50:1). Neither is `#ff5722`.

`--brand-ink` is defined on `:root`, not only under `[data-surface="marketing"]`. The wordmark
renders in the app shell and on sign-in too, and an unresolved custom property is invalid at
computed-value time — the "Forge" half silently inherits the surrounding colour rather than
failing loudly.

### The mark

An anvil with a molten arrow struck off its face and three steel index bars stepping up behind, on
an obsidian squircle. Drawn as SVG in two places on the same 64×64 grid:

- `src/components/brand/logo.tsx` — the React component. Themeable, inlined, no network.
- `scripts/generate-brand-assets.cjs` — plain Node, rasterises through sharp.

Two copies of one shape is normally a smell. The alternative is worse: the component must be a
component, and the generator must run without a bundler. Same grid and same path data means a
change is a mechanical copy rather than a redraw.

```bash
node scripts/generate-brand-assets.cjs
```

That regenerates all eight assets — store icon, Android adaptive foreground (inset 0.62 for the
launcher crop), splash, notification silhouette, favicon, desktop icon and the two web icons.
The notification icon is a **white silhouette** because Android tints it and discards everything
but the alpha channel.

The OG image at `src/app/(marketing)/opengraph-image.tsx` inlines the same geometry a third time,
because Satori renders the element tree directly and cannot fetch an image at request time.

### Typography

Plus Jakarta Sans for interface copy, JetBrains Mono for figures — loaded through `next/font` and
exposed as `--font-sans-brand` / `--font-mono-brand`, with the previous system stacks kept as
fallbacks in `--font-sans` / `--font-mono`. Metrics are compared column-against-column, so the
numerals have to be monospaced.

### Identifiers

| | |
| --- | --- |
| Mobile bundle id / package | `com.indexforge.app` |
| Desktop appId | `com.indexforge.desktop` |
| Deep link scheme | `indexforge://` |
| Universal / app links | `indexforge.com` |

**These are permanent once anything is published.** Google Play binds the `applicationId` to a
listing for its lifetime and App Store Connect does the same with the bundle identifier. If the
real domain differs from `indexforge.com`, change it before the first submission, not after.
