# IndexForge desktop

Electron client for Windows and macOS.

## What this is, and what it is not

This is a **client**. It does not contain the dashboard, the database, the job
queue or any business logic — all of that is the IndexForge web app. The desktop app
opens a window onto a running IndexForge server and adds the things a browser tab
cannot give you: a Start Menu / Dock entry, a tray icon, a native menu bar,
`indexforge://` deep links, and a window that remembers where it was.

That means **the server has to be running somewhere**. On first launch the app
asks for its address and defaults to `http://localhost:3000`.

Electron rather than Tauri: Tauri needs the Rust toolchain on Windows and Xcode
command line tools on macOS before it will build at all. Electron builds both
targets from one npm install. The cost is installer size — the Windows build
measures 181 MB against Tauri's ~5 MB, because Chromium is bundled rather than
borrowed from the OS.

## Running it in development

Start the IndexForge server first (`npm run dev` at the repo root), then:

```bash
npm run dev -w @aso/desktop
```

That compiles `src/` to `dist/` and launches Electron against it. There is no
hot reload for the main process — re-run the command after editing it.

## Building installers

```bash
npm run dist:win -w @aso/desktop   # NSIS .exe
npm run dist:mac -w @aso/desktop   # .dmg
```

**A macOS build only runs on macOS.** electron-builder can cross-compile many
things; a `.app` bundle with a valid signature is not one of them. Use a Mac or
the GitHub Actions workflow in `.github/workflows/desktop.yml`, which builds
both from one push.

Output goes to `apps/desktop/release/`.

### A Windows build trap

Extracting Electron into `release/` fails on this repo's `D:` drive:

```
EPERM: operation not permitted, rename 'release\win-unpacked.tmp' -> 'release\win-unpacked'
```

electron-builder unpacks to a `.tmp` directory and renames it. Something —
almost certainly the realtime scanner, which is enabled here — holds a handle on
the freshly written tree long enough for the rename to fail, and it fails again
on retry rather than clearing. Deleting the directory works, so it is not a
permissions problem.

Building to a different output directory avoids it:

```bash
npx electron-builder --win --x64 --config.directories.output=%LOCALAPPDATA%\Temp\if-release
```

If you hit this, that is the workaround, not a broken config.

### A monorepo build trap

electron-builder walks up to the workspace root looking for native modules to
rebuild against Electron's headers. It finds the *web* app's — `msgpackr-extract`
and `sharp` — and tries to compile them:

```
⨯ node-gyp failed to rebuild '<repo>/node_modules/msgpackr-extract'
```

That needs a C++ toolchain, and this build has no use for it: the desktop app
declares no runtime dependencies and `files` bundles nothing from
`node_modules`. `npmRebuild: false` in `electron-builder.yml` turns the step off.
Leave it off unless this app ever gains a native dependency of its own.

Related: do not run two builds against the same output directory. The second one
dies with `7za.exe process failed 3221225794` (`STATUS_DLL_INIT_FAILED`), which
names nothing useful. If a build appears to hang and you start another, kill the
first.

### Signing

Neither target is signed. Unsigned means:

- **Windows** shows a SmartScreen warning on first run. An OV or EV code
  signing certificate removes it.
- **macOS** refuses to open the app at all, with a message saying it is
  *damaged* — which is misleading; it means unsigned and un-notarized. Needs an
  Apple Developer account, then `CSC_LINK` / `CSC_KEY_PASSWORD` and
  `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` in the build
  environment. `hardenedRuntime` and the entitlements file are already
  configured for it.

## Security posture

The window that loads the dashboard is deliberately unprivileged:

| Setting | Value | Why |
| --- | --- | --- |
| `contextIsolation` | `true` | Renderer cannot touch Electron internals |
| `nodeIntegration` | `false` | No `require` in page context |
| `sandbox` | `true` | Renderer runs in the OS sandbox |
| `preload` | **none** | No IPC surface at all for remote content |
| `webviewTag` | `false` | No nested embedding |

The connection window is a separate `BrowserWindow` with its own preload, and it
loads a local file with a CSP that forbids remote script and remote connections.
The split matters: if the dashboard window shared that preload, whatever the
server served could call `connect()` and repoint the app at another origin on
its next launch.

Two more guards live in `hardenNavigation`:

- `will-navigate` to anything outside the configured origin is cancelled and
  handed to the system browser. Without it, one external link in a review body
  replaces the app with that page inside a window still holding the session
  cookie.
- `setWindowOpenHandler` denies every popup and opens it externally instead.
- Camera, microphone and geolocation permission requests are refused. Only
  notifications are allowed.

## Settings

Stored as JSON in the Electron `userData` directory:

- Windows — `%APPDATA%\IndexForge\settings.json`
- macOS — `~/Library/Application Support/IndexForge/settings.json`

```json
{
  "serverUrl": "http://localhost:3000",
  "bounds": { "x": 100, "y": 100, "width": 1280, "height": 860 },
  "maximized": false
}
```

`serverUrl` is parsed through `normalizeServerUrl`, which accepts only `http:`
and `https:` and keeps only the origin. A malformed or unreadable file falls
back to defaults rather than failing to start — including a file saved with a
UTF-8 BOM, which `JSON.parse` rejects.

`productName` in `package.json` is what puts this under `IndexForge`. Without it
Electron derives the directory from the package name and produces a folder
literally called `@aso`.

## Connecting

`checkServer` asks the candidate origin for `/api/health` and treats the answer
three ways:

- **fail** — nothing answered, or what answered has no `/api/health`. A typo
  that lands on an unrelated web server must not become a page loaded into a
  window that holds the session, so a bare TCP connect is not enough.
- **degraded** — an IndexForge server answered `503` because a dependency of *its* own
  is down. Connect anyway: the dashboard explains a missing Postgres far better
  than a connection dialog can.
- **ok** — healthy.

Node's `fetch` collapses nearly every network failure into the string
`fetch failed` and hides the reason on `error.cause.code`. `describeNetworkError`
unpacks it, because "Nothing is listening at http://localhost:3000" is
actionable and "fetch failed" reads like a bug in this app.

## Deep links

`indexforge://apps/<id>` opens `<serverUrl>/apps/<id>` in the running window, raising it
first. The protocol is registered at startup — against the packaged binary in a
release build, and against the entry script when running from source, because in
development the executable is Electron itself.

Note that `new URL("indexforge://apps/123")` puts `apps` in `host`, not `pathname`, so
the route is rebuilt from both halves.

## What is verified

Checked on Windows 11 against a local server:

- Launches, loads the dashboard, signs in, renders live data
- Native menu bar; window bounds persist
- Connection window appears when the configured server is unreachable, and
  reports the actual reason
- Settings land in `%APPDATA%\IndexForge`
- `electron-builder --win` produces `IndexForge-0.1.0-x64.exe` (181 MB) and
  `IndexForge-0.1.0-arm64.exe` (177 MB), and the packaged `win-unpacked/IndexForge.exe`
  runs standalone — not only under `electron .`

Not verified: **anything on macOS** — no Mac was available. The build config,
entitlements and CI workflow are written but have never run. Also unverified:
`indexforge://` deep links, the tray icon, and the packaged installer's behaviour on a
machine that is not this one.
