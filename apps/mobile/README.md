# @aso/mobile

Expo (React Native) companion app for iOS and Android.

> **Runs on a real device.** Built with `expo run:android` and verified on a
> Pixel 7: sign-in, the app list, and the per-app overview all render live data
> from the dev server, and the numbers match the web dashboard exactly. Google
> OAuth and push delivery are still unverified — see
> [What is not verified](#what-is-not-verified).

## What it does

A companion, not parity with the web app:

| On here | Stays on the web |
| --- | --- |
| Push alerts | Connecting integrations, OAuth flows |
| Portfolio and per-app numbers | AI metadata editing |
| Keyword ranks with competitor head-to-head | Alert rule authoring |
| Reading and replying to reviews | Org, member and API-key administration |
| Devices, notification prefs, account deletion | CSV export |

Anything involving pasting a `.p8` key or writing metadata against character
limits belongs on a keyboard.

## Setup

```bash
npm install
```

```bash
cd apps/mobile && npx expo start
```

Environment, in `apps/mobile/.env`:

```
EXPO_PUBLIC_API_URL=http://192.168.1.x:3000
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=…
EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=…
EAS_PROJECT_ID=…
```

`EXPO_PUBLIC_API_URL` must be a LAN address, not `localhost` — `localhost` on a
phone is the phone. In development you can sign in with the dev email provider;
the server refuses it when `NODE_ENV=production`.

## What is verified

On a Pixel 7, against the local dev server:

- **Metro bundles the monorepo** — 2461 modules, `@aso/shared` resolving, one
  copy of React, the reanimated babel plugin applied.
- **The Gradle build succeeds** and installs (16m 43s cold, much faster after).
- **Token auth works end to end.** Signing in creates a real `DeviceSession`
  row: `Pixel 7`, `ANDROID`, app version `1.0.0`, the device name coming from
  `expo-device` on actual hardware.
- **tRPC over the network works** with the bearer token — `mobile.home` and
  `mobile.appOverview` both return live data.
- **The numbers match the web exactly**: 37.9K installs, 32K organic, 5.9K paid,
  $19,096 revenue, $10,926 ad revenue, 23.7% conversion, keywords at #14/#20/#29.
  Same figures on both surfaces, which is the whole point of composing the
  mobile endpoints over the same helpers rather than reimplementing them.
- **Source precedence renders correctly** — ad revenue attributed to AdMob and
  not Firebase, organic installs marked Derived.
- **Charts render** through react-native-svg.
- **Deep links work**: `indexforge://apps/<id>` opens the right screen.
- **The web app is unaffected**: typecheck, 188 unit tests, a production build
  and every smoke suite still pass.

## What is not verified

1. **Google OAuth.** No client IDs are configured, so the sign-in screen
   correctly reports it as unavailable and only the dev provider was exercised.
2. **Push delivery** end to end — needs an EAS project id and a build registered
   with FCM.
3. **iOS, entirely.** Nothing has been built for it.
4. **Assets.** `adaptiveIcon` and the notification icon are commented out of
   `app.config.ts` because the PNGs do not exist. Restore both before
   submission — the default launcher icon is not shippable.

### Testing taps over adb

`adb shell input tap` is often too fast for React Native's `Pressable` and does
nothing. Use a held press instead:

```bash
adb shell input swipe X Y X Y 150
```

This cost time to diagnose — the card taps looked broken and were not.

### Dependency traps this project already hit

Both cost real time and neither is obvious from the error message:

**A stale nested `react-native`.** An earlier failed install left
`apps/mobile/node_modules/react-native@0.87.0` beside the correct root
`0.86.2` — and the nested copy was a partial install missing
`rn-get-polyfills.js`. Metro bundled 2461 modules fine and then died on a Node
`require`. `npm install` kept restoring it because the lockfile still pinned it.
The fix was deleting `package-lock.json` and the nested `node_modules`, then
reinstalling from the manifests.

**Never hand-pick native module versions.** The versions Expo supports live in
`node_modules/expo/bundledNativeModules.json`. Guessing `react-native@0.87.0`
when SDK 57 pins `0.86.2` produced a peer conflict in
`react-native-reanimated`, which supports only up to 0.86 — an error that names
reanimated and not the actual cause. Use `npx expo install <pkg>`, or read that
manifest.

### A monorepo detail worth knowing

`tsconfig.json` maps `@/*` to **two** roots — this app's `src` first, then the
web app's. The type-only `AppRouter` import drags the web app's server tree
through the checker, and that tree uses `@/` for its own imports. Without the
second root every router key resolves to a tRPC "collides with a built-in"
error string instead of a procedure, and every call site fails in a way that
does not name the real cause.

The two trees have no colliding subpaths today. If one is ever added, this is
where it will bite.

### Metro must not watch the repo root

`metro.config.js` sets `watchFolders` to `packages/` and the root
`node_modules/` — deliberately not the repo root itself. The root also holds
the local Postgres data directory (`.localdb/`), the Memurai install
(`.tools/`) and the Next.js build output (`.next/`). Watching it means Metro
crawls tens of thousands of files no bundle can reach, and with Postgres
writing its WAL continuously the native watcher never reaches a ready state.

The failure is slow and does not name itself:

    Failed to start watch mode.
      at Timeout._onTimeout (@expo/metro-file-map/build/Watcher.js:163:63)

That fires after four minutes. `fileMap.build()` then rejects, so
`DependencyGraph._resolutionCache` — which is only assigned inside that
promise's `.then()` — stays undefined, and the *next* thing to touch it throws.
What reaches the device is a red screen quoting `DependencyGraph.js (28:20)`
and `Cannot read properties of undefined (reading 'get')`, which points at
module resolution and says nothing about a watcher. Check
`$LOCALAPPDATA/Temp/metro.log` for the real line.

If a new workspace package is added, add it to `watchFolders`. Do not widen the
list to the repo root.

## Architecture notes

**Auth.** Short-lived access token plus a rotating refresh token, both in the
Keychain / Keystore via `expo-secure-store` — never AsyncStorage, which is
plaintext on disk.

The important detail is in `src/api/auth.ts`: **one shared in-flight refresh
promise.** Six queries firing on a cold start all see an expired token. Without
sharing, all six call refresh, the server rotates on the first and treats the
rest as replays — which revokes the device session and signs the user out for
doing nothing wrong.

**Offline.** The query cache is persisted, so the app opens with the last known
numbers instead of a spinner. Staleness is stated in the UI rather than implied:
a cached figure presented as current is the same class of error as a zero-filled
chart.

**Charts.** `react-native-svg` directly rather than a charting library, because
the two rules that matter are ones a general library makes awkward:

- The rank axis is **inverted** — rank 1 is the top.
- A **null rank breaks the line.** Plotting it as zero draws the app as the best
  result in the world on the day it fell out of the results entirely.

**No data is not zero.** `StatTile` takes `hasData` as a required prop. The
metric layer exists to distinguish an unconnected integration from a real zero,
and a tile that defaulted the flag would quietly erase that.

## Deep links

The web app serves both verification files:

- `/.well-known/apple-app-site-association` — needs `APPLE_APP_ID`
- `/.well-known/assetlinks.json` — needs `ANDROID_PACKAGE_NAME` and
  `ANDROID_SHA256_FINGERPRINTS`

Both return 404 until configured, which is deliberate: a malformed file is worse
than an absent one because both platforms cache the failure.

## Before submitting

- Run it. Nothing here has been on a device.
- Replace `com.indexforge.app` and `example.com` throughout `app.config.ts`.
- Add `PrivacyInfo.xcprivacy` and complete App Store data disclosure — you
  collect email, usage and device tokens.
- Prepare a demo account that reaches real functionality without connecting a
  Google Ads account. Reviewers will not have one.
- Account deletion is implemented in Settings; confirm it is reachable without
  signing in twice (App Review 5.1.1(v)).
