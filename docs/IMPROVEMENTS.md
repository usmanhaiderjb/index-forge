# Improvement plan

Ordered by what actually threatens the product, not by what is easiest. Each
item says why it matters and roughly what it costs.

The state this is written against: the web app, worker, Expo mobile client and
Electron desktop client all build and run; **286 unit tests pass**; the Docker
image builds and the full compose stack comes up healthy.

## Done since this was written

- **Docker image builds and the compose stack runs.** Verified end to end —
  migrations apply, worker connects, `/api/health` returns `{"ok":true}`. Three
  problems were found and fixed doing it: a missing `.dockerignore` (which let a
  host `node_modules` overwrite the Alpine one and baked `.env` into a layer), a
  missing `public/`, and `APP_URL` being undefined because `skipValidation`
  bypasses zod defaults.
- **Traffic-source breakdown** — shipped for both stores. See
  `PRODUCT-ROADMAP.md` §2 and `HANDOVER.md` §5.
- **IndexForge rebrand** — tokens, palette, typography, mark, all eight icons,
  app shell, both clients, and the bundle identifiers that were item 0.2.
- **Desktop app** builds, installs and runs on Windows; installers are
  reproducible.
- **Firebase push** — multi-project credential vault, campaigns, fan-out with
  retry classification. See `PUSH-PLAN.md`.
- **Keyword database, phases 1 and 2** — a global corpus built from store
  autocomplete and from the metadata of ranked apps, with a resumable crawl
  frontier and per-store difficulty scoring. Measured at ~47,000 new terms an
  hour. See `KEYWORD-DATABASE.md` §9. Four defects were found building it that
  affected the rest of the product, not just the crawler: the local Postgres
  cluster was WIN1252 so every non-ASCII string failed to insert, `storeFetch`
  had no request timeout, `throttleHost` let concurrent callers fire
  simultaneously despite appearing throttled, and Play autocomplete had been
  answering 404 into a silent `catch`.

---

---

## Tier 0 — Do these before anything else

### 0.1 Rotate the Anthropic API key

The key was pasted into a chat transcript. Treat it as public. Rotate it at
console.anthropic.com and put the new one only in `.env`, which is gitignored
and dockerignored.

**Cost:** minutes. **Risk if skipped:** someone else spends your API budget.

### 0.2 Bundle identifiers — done, but confirm the domain

Set during the IndexForge rebrand:

```
apps/mobile/app.config.ts            com.indexforge.app  (bundleIdentifier + package)
apps/desktop/electron-builder.yml    com.indexforge.desktop
apps/mobile/app.config.ts            associatedDomains: applinks:indexforge.com
```

Google Play permanently binds the `applicationId` to a listing, and App Store
Connect does the same with the bundle identifier. **Neither can be changed after
the first publish** — a mistake means a new listing and losing every install,
review and ranking the old one accumulated.

So the remaining action is a decision, not a code change: **confirm
`indexforge.com` is the domain you will actually own.** If it is not, change it
now. It costs nothing today and cannot be undone later.

**Cost:** minutes to confirm; an hour if it changes.

---

## Tier 1 — Before the first real user

### 1.1 Connect one live account per integration

Five connectors — Firebase, AdMob, Google Ads, Play Console, App Store Connect,
plus Apple Search Ads — have **never touched a live account**. They are written
and typed against the documented API shapes and tested against fixtures. That is
not the same as working.

This is the single largest product risk. Everything else — precedence,
derivation, charts, alerts, AI recommendations — is downstream of data arriving
correctly. If the Play Store scraper returns nothing, the product returns
nothing.

Expect the Play Store HTML scraper to need the most iteration; Google reshuffles
that payload without notice, which is why the parser locates fields by shape
rather than by a fixed path.

Do them one at a time, and after each: trigger a manual refresh, confirm rows in
`MetricPoint`, and check the provenance panel names the source you expect.

**Cost:** a day or two, mostly waiting on API access. Google Ads needs a
developer token with an approval process — start that first.

### 1.2 Continuous integration

`.github/workflows/` contains only `desktop.yml`. Nothing runs the test suite, a
typecheck or a build on push.

Every verification in this project so far has been manual. That is fine for one
person building; it stops being fine the moment a change lands that nobody
re-checks.

Minimum useful workflow: `npm ci`, `npm run typecheck`, `npm test`,
`npm run build` on push and pull request.

**Cost:** an hour. Highest ratio of value to effort on this list.

### 1.3 Prove the backup restores

`DEPLOYMENT.md` §7 specifies a nightly `pg_dump` shipped off the machine. Until
you have restored one into an empty database and seen the data, you have a cron
job, not a backup.

**Cost:** an hour, once.

### 1.4 Replace placeholder marketing content

`src/content/site.ts` already has the right mechanism — anything marked
`placeholder: true` renders behind a visible disclaimer, and a test enforces it.
Good. But the logo wall, testimonials and case studies are invented, and
`example.com` still appears in the scraper user agent and the contact details,
and the logo wall, testimonials and case studies are invented.

Nothing here is broken. It just cannot go in front of a customer.

**Cost:** depends entirely on how long it takes to get real logos and quotes.

---

## Tier 2 — Operational maturity

### 2.1 Error tracking

There is **no observability dependency at all** — no Sentry, no OpenTelemetry,
no structured logger. In production that means the first you hear of a failure
is a user telling you, and a worker that dies silently stays dead.

Sentry's free tier covers both the Next app and the worker process. Wire it into
the worker especially: a web error is visible, a background job failure is not.

**Cost:** an afternoon.

### 2.2 Integration tests

All 17 test files are unit tests. None start Postgres, none exercise a tRPC
procedure end to end, none go through the auth ladder.

The tests that exist are the right ones — source precedence, organic derivation,
metric aggregation, date handling, credential encryption — and they cover the
logic most likely to be silently wrong. What is untested is the wiring: RBAC,
the router surface, migrations against a real schema.

A handful of tests against a throwaway Postgres, covering
`publicProcedure → orgProcedure → adminProcedure` and one full sync path, would
catch a whole class of regression that unit tests structurally cannot.

**Cost:** a day.

### 2.3 Fix the lint script

`npm run lint` runs `next lint`, which is deprecated and drops into interactive
setup. So there is effectively no linting.

Move to ESLint directly with `@next/eslint-plugin-next`, and add it to CI.

**Cost:** an hour.

### 2.4 TypeScript version

Expo SDK 57 expects TypeScript `~6.0.3`; the repo is on `5.9.3`. Not urgent —
everything typechecks — but the gap widens and `expo-doctor` will keep flagging
it.

**Cost:** an hour, plus whatever new errors TS 6 surfaces.

---

## Tier 3 — Completing the platforms

None of these block the web product. They block *shipping the clients*.

| Item | Blocker | Cost |
| --- | --- | --- |
| iOS build | Needs a Mac (or EAS cloud build) | — |
| Push delivery | EAS project id + FCM credentials + APNs key | Half a day |
| macOS desktop build | `.github/workflows/desktop.yml` is written but has never run | Half a day |
| Apple Developer Program | Required for iOS and a signed macOS build | $99/year |
| Windows code signing | Removes the SmartScreen warning | $100–200/year |
| Google sign-in | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` unset, so it is disabled everywhere | An hour |

The mobile app currently has no working Google sign-in and falls back to the
development email provider, which the server refuses in production. **So there
is no way to sign in to a production build of the mobile app today.** That makes
Google OAuth setup a hard blocker for shipping mobile, not a nice-to-have.

---

## Tier 4 — Unverified, lower stakes

- **AI features have never run.** The Anthropic account had no credits, so
  recommendations, review sentiment and screenshot analysis are untested against
  the real API. The error mapping in `describeAiError` is tested; the happy path
  is not.
- **Desktop deep links (`indexforge://`) and the tray icon** were built but never
  exercised.
- **`docker compose` was verified against an empty database.** No integration
  has been connected from inside a container.

---

## What is already good, and worth not breaking

Worth stating, because the list above is all deficits:

- **Source precedence as ranked tiers.** Connecting a second ad network adds to
  spend rather than replacing it. This was a real bug, caught and fixed, and it
  is enforced by a test.
- **Organic install derivation** de-duplicates before deriving, only derives
  inside the paid-data span, floors at zero and records `meta.floored`.
- **Provenance is surfaced in the UI.** Every figure can be traced to the
  provider it came from without opening a laptop. This is the feature that makes
  the numbers trustworthy — a competitor showing one blended number cannot
  answer "where did that come from".
- **The placeholder guard.** Invented content cannot silently become a claim.
- **Credential encryption** is AES-256-GCM with the key outside the database.
- **`/api/health` reports dependency state**, not just process liveness, which
  is why the compose health check and the desktop client's connection check both
  mean something.

---

## If you only do three things

1. **Change the bundle identifiers** (0.2) — the only genuinely irreversible
   item on this list.
2. **Connect one live integration** (1.1) — until data arrives from a real
   account, the product is unproven end to end.
3. **Add CI** (1.2) — an hour, and it protects everything else from here on.
