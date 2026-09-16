# Mobile app plan — iOS and Android

Approach, backend prerequisites, and the app build. Written so it can be executed in order; the
backend phases are genuinely blocking and doing them second means rewriting the app.

- **[0. Decision and scope](#0-decision-and-scope)**
- **[1. Backend prerequisites](#1-backend-prerequisites)** ← start here
- **[2. Shared code extraction](#2-shared-code-extraction)**
- **[3. The Expo app](#3-the-expo-app)**
- **[4. Store release](#4-store-release)**
- **[5. Effort and sequencing](#5-effort-and-sequencing)**
- **[6. Risks](#6-risks)**

---

## 0. Decision and scope

**Stack: Expo (React Native) + tRPC.**

The deciding factor is specific to this codebase, not a general preference. `AppRouter` gives a
TypeScript client end-to-end type safety against the existing API with zero schema duplication, and
everything in `src/lib/` is already framework-free — no file there imports React or Next. Flutter or
twice-native throws that away and makes you hand-maintain the same models in a second language.

Secondary: Expo's EAS Build produces iOS builds without a Mac.

### Scope — companion, not parity

| On mobile | Stays on desktop |
| --- | --- |
| Push alerts (the actual reason to exist) | Connecting integrations, OAuth flows |
| Dashboard at a glance | AI metadata editing and publishing |
| Keyword rank + competitor head-to-head | Alert rule authoring, digest config |
| Review reading and replying | Org/member/API-key administration |
| Chart positions | CSV export |

Anything involving pasting a `.p8` key or composing store metadata against character limits belongs
on a keyboard.

---

## 1. Backend prerequisites

All of this lands in the existing repo before the app starts. Roughly 40% of total effort.

### 1.1 Mobile authentication — the blocking one

**The problem.** `src/server/auth.ts:101` uses Auth.js JWT sessions delivered as httpOnly cookies,
and `createTRPCContext` calls `auth()` which reads those cookies. A native app has no cookie jar
worth relying on, and stuffing a session cookie into AsyncStorage is both fragile and a real
security regression — it is a long-lived credential in plaintext storage with no revocation path.

**The shape.** Short-lived access token, long-lived rotating refresh token, server-side revocable.

Do **not** reuse the `ApiKey` model. It is organization-scoped, non-expiring by default and built
for server-to-server integrations. A user session is a different lifecycle with different
revocation semantics, and conflating them means revoking a phone kills a customer's CI integration.

**Status: implemented.** `prisma/schema.prisma`, `src/server/mobile-auth.ts`,
`src/app/api/mobile/auth/**`, migration `20260817101910_device_sessions`. Covered by
`npm run smoke:mobile` (22 checks).

**Schema — two tables, not one.** The original sketch here kept a single `hashedRefresh` column on
`DeviceSession` and updated it on rotation. That cannot detect replay: overwriting the hash makes a
stolen token indistinguishable from an unknown one. Detection requires the *used* token to survive,
so rotation writes a new row instead of updating in place.

```prisma
/// The device. One row per phone, not per sign-in.
model DeviceSession {
  id         String         @id @default(cuid())
  userId     String
  platform   DevicePlatform
  deviceName String?
  appVersion String?
  lastUsedAt DateTime       @default(now())
  createdAt  DateTime       @default(now())
  revokedAt  DateTime?
  /// Why, so a support conversation has an answer.
  revokedFor String?

  user   User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokens RefreshToken[]

  @@index([userId, revokedAt])
  @@map("device_sessions")
}

/// One issued refresh token. New row per rotation — see above.
model RefreshToken {
  id          String    @id @default(cuid())
  sessionId   String
  hashedToken String    @unique
  expiresAt   DateTime
  /// Set the moment it is exchanged. A second presentation is a replay.
  usedAt      DateTime?
  createdAt   DateTime  @default(now())

  session DeviceSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, usedAt])
  @@index([expiresAt])
  @@map("refresh_tokens")
}

enum DevicePlatform {
  IOS
  ANDROID
}
```

**Rotation with replay detection.** Every refresh marks the presented token used and issues a new
one, in a single transaction — a crash between the two must not consume the old token without
producing a replacement, which would lock the device out with no way back.

Presenting an already-used token means the value was captured: the legitimate client only ever
holds the newest one. Rejecting just that call leaves the thief holding a working chain, so the
**whole device session is revoked**. Standard OAuth 2.0 BCP behaviour, and the smoke test asserts
both halves — the replay is refused *and* the rotated token stops working.

**Used tokens are kept past expiry** (pruned after 30 days). Deleting them on expiry would turn a
stolen-token alarm into a silent "unknown token" rejection.

**Endpoints** (`src/app/api/mobile/auth/`):

| Route | Does |
| --- | --- |
| `POST /token` | Exchange a completed OAuth sign-in for an access + refresh pair |
| `POST /refresh` | Rotate; returns a new pair. Reuse ⇒ revoke family |
| `POST /revoke` | Sign out this device |

**Sign-in flow.** Use `expo-auth-session` with Google's native flow and PKCE; the app never handles
a password. Exchange the resulting identity at `POST /token`. The dev credentials provider stays
web-only and production-disabled — do not extend it to mobile.

**tRPC context change** — additive, so the web keeps working untouched. Bearer is tried first and a
bad one **falls through to the cookie path**, so an invalid token looks exactly like no token.
Everything downstream — `protectedProcedure`, `orgProcedure`, the whole RBAC ladder, tenant
scoping — is unchanged. That is the point of putting it in one place.

`Context.deviceSessionId` is optional: server-side callers (RSC pages, route handlers, smoke
scripts) build a context by hand and have no device.

**Token lifetimes:** access 15 minutes, refresh 60 days. Access tokens are signed with
`AUTH_SECRET`, carry `sub` and `sid`, and are scoped with an `aud` of `aso-mobile` so they cannot
be accepted anywhere a differently-scoped token signed with the same secret would be.

Access tokens are stateless, but `sessionFromAccessToken` still checks the device session is live
on every call — one indexed lookup, and it is the difference between "revoked" meaning immediately
and meaning within fifteen minutes.

**Endpoints are rate limited** through the existing Redis helper: 10 sign-ins per 5 minutes per IP,
60 refreshes, 30 revocations. The limiter is best-effort and fails open — Redis being unreachable
must not take authentication down with it.

**Storage on device:** `expo-secure-store` (Keychain / Keystore). Never AsyncStorage.

### 1.2 Push notifications as an alert channel

**Status: implemented.** `src/server/notify/push.ts`, `src/server/api/routers/device.ts`,
migration `20260817103154_device_tokens_and_prefs`. Covered by unit tests and `smoke:mobile`.

The rule engine already existed and `AlertRule.channels` is a JSON blob doing `webhook` and
`email`. Push slots in beside them, and keeps the existing rule that **channels are independent** —
a failed push must not stop the email.

```prisma
/// An Expo push token for one device. Separate from DeviceSession because a
/// user can revoke notifications without signing out, and tokens rotate on
/// their own schedule when the OS reissues them.
model DeviceToken {
  id              String    @id @default(cuid())
  deviceSessionId String
  userId          String
  /// ExponentPushToken[...]. Unique so a reinstall replaces rather than duplicates.
  token           String    @unique
  platform        DevicePlatform
  /// Set when Expo reports DeviceNotRegistered, so we stop sending to it.
  invalidatedAt   DateTime?
  createdAt       DateTime  @default(now())

  session DeviceSession @relation(fields: [deviceSessionId], references: [id], onDelete: Cascade)
  user    User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, invalidatedAt])
  @@map("device_tokens")
}
```

**Channel config** extends the existing parsed shape:

```ts
{ "webhook": "https://…", "email": ["ops@acme.com"], "push": { "userIds": ["…"] } }
```

**Delivery** goes in `src/server/notify/push.ts`, called from `deliverAlert` alongside the existing
channels. Keep the existing rule that **channels are independent** — a failed push must not stop
the email.

Four things that matter and are usually missed — all handled:

- **Batch.** Expo accepts up to 100 messages per request. A 500-device org is 5 calls, not 500.
- **Receipts identify a ticket, not a token.** This is the trap. Expo's receipt response does not
  say which device failed, so a receipt check written the obvious way can count `DeviceNotRegistered`
  but cannot act on it. The ticket → token mapping is kept in Redis with a 3-day TTL, which is what
  makes retiring dead tokens actually work.
- **Membership is resolved at send time**, not read from the stored channel config, so a user
  removed from an organization stops receiving its alerts immediately.
- **Deep link in the payload**, so a tap lands on the alert rather than a generic dashboard.

**Notification preferences** shipped alongside, not after: `pushEnabled`, `minSeverity`, and quiet
hours evaluated in the user's own IANA zone. CRITICAL ignores quiet hours — an alert nobody
configured as routine is exactly what quiet hours should not swallow. The midnight-spanning window
(22 → 8) is a union rather than a range and has its own tests, since that is the case a naive
comparison gets wrong.

An alerting product that wakes someone at 3am for a routine wobble gets its notifications disabled
once, permanently, and no later feature recovers that.

### 1.3 Rate limiting on tRPC

**Status: implemented.** A middleware on `publicProcedure`, so every procedure inherits it.

Keyed on the user when there is one and on a hashed IP when there is not — an authenticated user
behind a shared office address should not be throttled by a colleague. Mutations get their own,
tighter bucket (60/min vs 300/min): a burst of reads is a chatty client, a burst of writes usually
is not.

Server-side callers are exempt. `src/trpc/server.ts` stamps `x-trpc-source: rsc`, and a page
rendering several server components would otherwise spend a visitor's budget against them.

Fails open on a Redis error. Redis being unreachable already blocks background jobs; it must not
also make the app unreadable.

### 1.4 Mobile-shaped endpoints

**Status: implemented.** `src/server/api/routers/mobile.ts`, covered by `smoke:mobile-api`.

Chatty clients on mobile networks feel broken. The web dashboard fires six parallel tRPC calls on
load — fine over a LAN, poor on 4G.

- `mobile.home` — app list with headline figures, org totals, open alert count. One round trip.
- `mobile.appOverview` — tiles, a pre-shaped sparkline series, and top keyword ranks.

Compositions over the existing helpers, not a second implementation: they call
`preferAuthoritativeSource` and `METRIC_META[...].aggregation` directly. A parallel implementation
of precedence is how two surfaces start disagreeing about what a number is — the smoke test asserts
`mobile.appOverview` and `metrics.summary` return the same install count.

Both carry `hasData` per metric and name the `sources` behind each figure, so the discipline that a
metric with no source reports as no data rather than zero survives onto a small screen.

### 1.5 Account deletion — Apple requires it

**Status: implemented.** `src/server/api/routers/account.ts`.

App Review guideline 5.1.1(v): any app offering account creation must offer in-app deletion, and it
has to actually delete rather than deactivate.

The delete is the easy part. What happens to the user's organizations is not:

| Case | Behaviour |
| --- | --- |
| Sole member of a workspace | The workspace is deleted with them |
| Sole owner, other members exist | **Blocked** until ownership is transferred |
| Ordinary member | Only their membership is removed |

Blocking the sole-owner case is deliberate. Silently promoting someone, or orphaning a workspace
other people are still using, are both worse than telling the user to make a decision only they can
make. `account.deletionImpact` reports exactly what will happen *before* the confirmation, and the
check is re-run inside the mutation — the impact query ran at some earlier moment, and a workspace
can gain a member in between.

Confirmation is typing the email address, not a checkbox. Audit entries and sent invitations null
their actor rather than cascading, so a workspace other people still use keeps its history.

### 1.5 Also worth doing now

- **Deep link routes** — `indexforge://` scheme plus Universal Links / App Links, which need
  `apple-app-site-association` and `assetlinks.json` served from the web app.
- **Version gate** — a `mobile.minimumVersion` check so a broken build can be forced to update.
- **Audit log** — device sign-in and revocation into the existing `AuditLog`.

---

## 2. Shared code extraction

**Status: implemented.** `packages/shared`, with its own README.

```
aso/
  package.json        ← workspace root AND the web app
  src/                ← the Next.js app
  packages/shared/    ← framework-free TypeScript
  apps/mobile/        ← the Expo app, when it exists
```

**Deviation from the original sketch, which had `apps/web/`.** The web app stays at the repo root
rather than moving under `apps/`. Moving it would touch `prisma.config.ts`, the Dockerfile, both
compose files, `.claude/launch.json`, the `.localdb` and `.tools` paths, `.env` resolution and
every npm script — a large mechanical change whose only benefit over this layout is directory
symmetry. The actual goal, code the mobile app can import, is fully met either way.

`apps/*` is already declared in `workspaces`, so adding `apps/mobile` needs no restructuring. If
the symmetry becomes worth having later, the move is the same size then as it is now.

**Moved**, and all ~65 import sites rewritten to `@aso/shared`:

| Module | Why it matters on mobile |
| --- | --- |
| `date.ts` | The UTC parsing fix. A second implementation would reintroduce the day-shift bug |
| `format.ts` | `METRIC_META` — labels, units, `aggregation`, `higherIsBetter` |
| `tokens.ts` | The dataviz palette in JS, extracted from `globals.css` |
| `locales.ts`, `slug.ts`, `utils.ts` | Helpers |
| `contact-schema.ts` | Zod schema shared between form and router |

`format.ts` imports `MetricKey` with `import type`, so the package carries no Prisma runtime — that
matters for a React Native bundle.

**Stayed behind:** `blog.ts` (filesystem, `server-only`), `csv.ts` (Play Console parsing),
everything under `src/server/`. Precedence and derivation stay on the server because they query the
database; mobile consumes their output through tRPC rather than a reimplementation.

**Exported as types only:** `AppRouter`. The mobile app imports the type, never the implementation.

Wiring: `transpilePackages` in `next.config.ts`, a `paths` entry in `tsconfig.json`, a matching
alias in `vitest.config.ts`, and `COPY packages/` in the Dockerfile for the worker — which resolves
the package at runtime through the workspace symlink, unlike the web process where Next inlines it.

---

## 3. The Expo app

### Stack

| Concern | Choice | Note |
| --- | --- | --- |
| Framework | Expo SDK 52+, React Native | EAS Build, no Mac needed for iOS |
| Navigation | Expo Router | File-based, matches the mental model of the web app |
| Data | tRPC client + TanStack Query | Same library as web; cache/retry/offline for free |
| Charts | **Victory Native XL** (Skia) | Recharts is web-only and does not port |
| Styling | NativeWind v4 | Tailwind syntax; tokens shared, classes not 1:1 |
| Secure storage | `expo-secure-store` | Keychain / Keystore |
| Push | `expo-notifications` | Expo push service over APNs/FCM |
| Auth | `expo-auth-session` | Native Google flow with PKCE |

### Structure

```
apps/mobile/
  app/
    (auth)/sign-in.tsx
    (tabs)/
      index.tsx              home — portfolio summary
      apps/[id]/
        index.tsx            overview: tiles, organic split, trend
        keywords.tsx         ranks + competitor head-to-head
        reviews.tsx          list, filter, reply
      alerts.tsx             open events, acknowledge
      settings.tsx           notification prefs, sign out, revoke devices
    _layout.tsx              providers, deep-link handling, auth gate
  src/
    api/trpc.ts              typed client + auth link + refresh-on-401
    components/              StatTile, RankChart, ReviewCard, AlertRow
    hooks/                   usePushRegistration, useAuth
    theme/                   tokens from packages/shared
```

### Details that decide whether it feels good

**Token refresh.** A tRPC link that catches 401, refreshes once, retries — and **de-duplicates
concurrent refreshes**. Six queries firing on cold start must trigger one refresh, not six racing
ones that rotate each other's tokens and log the user out.

**Offline.** Persist the query cache (`@tanstack/query-async-storage-persister`). Last-known
numbers on a plane beat a spinner. Show the staleness explicitly — a stale figure presented as
current is the same class of error as a zero-filled chart.

**Charts.** Port the validated palette rather than picking new colours. Rank charts invert the
y-axis, and null ranks **break the line** — they must not be drawn as zero. Same rule as the web.

**No-data states.** The whole product's discipline is that a metric with no source reports as
having no data, never as zero. Small screens make it tempting to show a dash and move on; carry the
reason through instead.

---

## 4. Store release

**You will be dogfooding.** An ASO platform's own listing is a credibility document, so treat it as
a real listing: proper keyword field, screenshots that lead with value, localised where it matters.
Track it in the product itself.

Practical requirements:

- **Apple privacy manifest** (`PrivacyInfo.xcprivacy`) — required. Declare what is collected.
- **App Store data disclosure** — you collect email, usage and device tokens. Say so accurately.
- **Account deletion in-app** — Apple requires it. The backend is done (§1.5); the app still needs
  to render it, and so does the web settings page.
- **Demo account for review** — reviewers must reach real functionality without connecting a Google
  Ads account. Prepare a seeded read-only account.
- **Push justification** — Apple rejects push used for marketing without consent. Alerts are
  transactional; keep them that way.

---

## 5. Effort and sequencing

| Phase | Work | Weeks |
| --- | --- | --- |
| 1 | Backend: auth, push channel, rate limiting, composed endpoints | 2–3 |
| 2 | Workspace split, shared package | 0.5 |
| 3 | App shell, auth flow, navigation, home | 1.5 |
| 4 | App detail, keywords, competitor view, charts | 2 |
| 5 | Reviews and replies | 1 |
| 6 | Push wiring, deep links, preferences | 1 |
| 7 | Offline, polish, empty and error states | 1 |
| 8 | Store assets, privacy manifests, submission, review cycles | 1–2 |

**Total: 10–13 weeks** to both stores. The earlier 6–10 estimate was for the app alone; this
includes the backend work and store review, which is where mobile projects actually slip.

**First reviewable milestone: end of phase 3** — sign in on a real device, see real numbers.

---

## 6. Risks

**Apple review rejection.** Most likely causes here: missing in-app account deletion (rule 5.1.1v)
and a reviewer unable to see functionality without connecting an integration. Both are preventable
and both are on the checklist above.

**The backend work gets skipped.** The strongest temptation will be to ship the app against the
existing cookie session by storing it in AsyncStorage. It will appear to work. It is a long-lived
credential in plaintext with no revocation, and unwinding it after launch means forcing every user
to re-authenticate.

**Scope creep toward parity.** Every desktop feature will be requested on mobile. The integration
connect flow in particular — it involves OAuth redirects and pasting `.p8` keys and is genuinely
worse on a phone. Hold the line.

**Push fatigue.** Ship quiet hours and a severity threshold in the first release, not the second.
The failure mode is silent and permanent: users disable notifications once and never return.

**Chart library migration.** Victory Native XL is Skia-based and good, but it is not Recharts.
Budget real time for the rank chart specifically — inverted axis plus line breaks on null is the
awkward case, and it is the chart that matters most.

---

## Appendix — order of operations

```
1. DeviceSession + RefreshToken schema, migration                    ✅ done
2. Token issue / refresh / revoke endpoints, with replay detection   ✅ done
3. tRPC context accepts bearer                                       ✅ done
4. Rate limiting on tRPC + the auth routes                           ✅ done
5. DeviceToken schema, push channel in notify, receipt handling      ✅ done
6. Notification preferences model                                    ✅ done
7. mobile.home / mobile.appOverview composed procedures              ✅ done
8. Account deletion endpoint (Apple requires it)                     ✅ done
9. Workspace split, packages/shared                                  ✅ done
10. Expo app — built and running on a Pixel 7                        ✅ done
```

**Steps 1–8 are complete.** The backend is ready for an app to be built against it:

```bash
npm run smoke:mobile       # 28 checks — tokens, rotation, replay, push registration
npm run smoke:mobile-api   # 26 checks — composed endpoints, account deletion
```

Everything from here is in a new workspace. Nothing further is blocking.

### 1.6 Still missing before the app ships

- **Deep link routes** — `indexforge://` scheme plus Universal Links / App Links, which need
  `apple-app-site-association` and `assetlinks.json` served from the web app.
- **Version gate** — a `mobile.minimumVersion` check so a broken build can be forced to update.
- **A settings UI on the web** for device management and notification preferences. The procedures
  exist (`devices.list`, `devices.revoke`, `devices.setPreferences`); nothing renders them yet.
