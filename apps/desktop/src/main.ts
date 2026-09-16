import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  ipcMain,
  nativeImage,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import path from "node:path";

import { checkServer } from "./reachable";
import * as settings from "./settings";

const PROTOCOL = "indexforge";
const IS_MAC = process.platform === "darwin";

let mainWindow: BrowserWindow | null = null;
let connectionWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

/** Set when the user picks Quit, so macOS knows a close is really a close. */
let quitting = false;

/** Reason the connection window was opened, read once by the page. */
let pendingReason: string | null = null;

function serverOrigin(): string {
  return settings.read().serverUrl;
}

function iconPath(): string {
  return path.join(__dirname, "..", "build", "icon.png");
}

/* ------------------------------------------------------------------ windows */

function createMainWindow(): BrowserWindow {
  const saved = settings.read();

  const window = new BrowserWindow({
    ...saved.bounds,
    minWidth: 640,
    minHeight: 480,
    show: false,
    title: "IndexForge",
    icon: iconPath(),
    backgroundColor: "#f8fafc",
    // macOS gets an inset traffic-light strip rather than a stock title bar,
    // which is the platform convention for an app that is mostly one web view.
    titleBarStyle: IS_MAC ? "hiddenInset" : "default",
    webPreferences: {
      // No preload, no IPC, no node. This window shows content from a remote
      // origin; it gets the capabilities of a browser tab and nothing else.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: true,
    },
  });

  if (saved.maximized) window.maximize();

  window.once("ready-to-show", () => window.show());

  hardenNavigation(window);
  rememberBounds(window);

  window.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    // -3 is ERR_ABORTED, which every cancelled in-page navigation reports.
    if (!isMainFrame || code === -3) return;
    openConnectionWindow(`Could not load ${url}. ${description}`);
  });

  window.on("close", (event) => {
    if (IS_MAC && !quitting) {
      // Closing the last window on macOS hides the app rather than exiting it.
      event.preventDefault();
      window.hide();
    }
  });

  window.on("closed", () => {
    mainWindow = null;
  });

  return window;
}

/**
 * The dashboard window may only ever show the configured server.
 *
 * Without this, one link to an external site — a docs link, an OAuth provider,
 * anything inside a review body — replaces the app with that page, in a window
 * that still holds the session cookie. External destinations go to the real
 * browser instead, which is also where the user expects them.
 */
function hardenNavigation(window: BrowserWindow): void {
  const isOurs = (target: string): boolean => {
    try {
      return new URL(target).origin === serverOrigin();
    } catch {
      return false;
    }
  };

  window.webContents.on("will-navigate", (event, target) => {
    if (isOurs(target)) return;
    event.preventDefault();
    void shell.openExternal(target);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  // Nothing here needs a camera, a microphone or a location, so a request for
  // one is either a mistake or something worse.
  window.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === "notifications");
  });
}

function rememberBounds(window: BrowserWindow): void {
  const save = (): void => {
    if (window.isDestroyed()) return;
    const maximized = window.isMaximized();
    // `getBounds` while maximized returns the maximized size, which would make
    // un-maximizing restore to that same size and appear to do nothing.
    settings.write(maximized ? { maximized } : { maximized, bounds: window.getBounds() });
  };

  window.on("resize", save);
  window.on("move", save);
  window.on("close", save);
}

function openConnectionWindow(reason: string | null = null): void {
  if (connectionWindow && !connectionWindow.isDestroyed()) {
    connectionWindow.focus();
    return;
  }

  pendingReason = reason;

  connectionWindow = new BrowserWindow({
    width: 560,
    height: 470,
    resizable: false,
    title: "Connect to your IndexForge server",
    icon: iconPath(),
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "preload-setup.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  connectionWindow.setMenuBarVisibility(false);
  void connectionWindow.loadFile(path.join(__dirname, "..", "renderer", "setup.html"));

  connectionWindow.on("closed", () => {
    connectionWindow = null;
    // Nothing to fall back to: the app never loaded and the user dismissed the
    // only screen that could fix that.
    if (!mainWindow || !mainWindow.isVisible()) app.quit();
  });
}

/* ---------------------------------------------------------------------- IPC */

ipcMain.handle("connection:current", () => {
  const reason = pendingReason;
  pendingReason = null;
  return { serverUrl: serverOrigin(), reason };
});

ipcMain.handle("connection:connect", async (_event, raw: unknown) => {
  const normalized = settings.normalizeServerUrl(String(raw ?? ""));
  if (!normalized) return "That is not a valid http or https address.";

  const check = await checkServer(normalized);
  // A degraded server is still the right server. Connect, and let the dashboard
  // explain its own problems — it can say far more about a missing dependency
  // than this dialog can.
  if (check.kind === "fail") return check.message;

  settings.write({ serverUrl: normalized });

  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow();
  await mainWindow.loadURL(normalized);
  mainWindow.show();

  connectionWindow?.destroy();
  connectionWindow = null;
  return null;
});

ipcMain.on("connection:cancel", () => {
  connectionWindow?.close();
});

/* --------------------------------------------------------------- menu, tray */

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(IS_MAC ? ([{ role: "appMenu" }] as MenuItemConstructorOptions[]) : []),
    {
      label: "File",
      submenu: [
        {
          label: "Connection settings…",
          accelerator: "CmdOrCtrl+,",
          click: () => openConnectionWindow(),
        },
        { type: "separator" },
        IS_MAC ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Back",
          accelerator: "Alt+Left",
          click: () => mainWindow?.webContents.navigationHistory.goBack(),
        },
        {
          label: "Forward",
          accelerator: "Alt+Right",
          click: () => mainWindow?.webContents.navigationHistory.goForward(),
        },
        { role: "reload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { role: "toggleDevTools" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "Open in browser",
          click: () => void shell.openExternal(serverOrigin()),
        },
        {
          label: "About IndexForge",
          click: () =>
            void dialog.showMessageBox({
              type: "info",
              title: "IndexForge",
              message: `IndexForge ${app.getVersion()}`,
              detail: `Connected to ${serverOrigin()}\nElectron ${process.versions.electron}`,
            }),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function buildTray(): void {
  const image = nativeImage.createFromPath(iconPath());
  if (image.isEmpty()) return;

  // A 1024px icon renders in the tray as a huge blurry square on Windows and
  // is rejected outright on macOS.
  tray = new Tray(image.resize({ width: IS_MAC ? 16 : 20, height: IS_MAC ? 16 : 20 }));
  tray.setToolTip("IndexForge");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open IndexForge", click: () => showMain() },
      { label: "Connection settings…", click: () => openConnectionWindow() },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", () => showMain());
}

function showMain(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
    void mainWindow.loadURL(serverOrigin());
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/* --------------------------------------------------------------- deep links */

/**
 * `indexforge://apps/<id>` becomes `<serverUrl>/apps/<id>`.
 *
 * Note that `new URL("indexforge://apps/123")` puts "apps" in `host`, not in
 * `pathname`, so the route has to be rebuilt from both halves.
 */
function routeForDeepLink(link: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(link);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${PROTOCOL}:`) return null;

  const route = `${parsed.host}${parsed.pathname}${parsed.search}`;
  return new URL(`/${route.replace(/^\/+/, "")}`, serverOrigin()).toString();
}

/** Finds a protocol URL among process arguments. */
function deepLinkFrom(argv: string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`)) ?? null;
}

function handleDeepLink(link: string): void {
  const target = routeForDeepLink(link);
  if (!target) return;

  showMain();
  void mainWindow?.loadURL(target);
}


/* ---------------------------------------------------------------- lifecycle */

// A second launch should raise the running window, not start a rival copy that
// fights it over the same settings file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const link = deepLinkFrom(argv);
    if (link) handleDeepLink(link);
    else showMain();
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  void app.whenReady().then(async () => {
    if (process.defaultApp) {
      // In development the executable is Electron itself, so the protocol has
      // to be registered against this script rather than a packaged binary.
      const entry = process.argv[1];
      if (entry) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(entry)]);
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL);
    }

    buildMenu();
    buildTray();

    const origin = serverOrigin();
    const check = await checkServer(origin);

    if (check.kind === "fail") {
      openConnectionWindow(check.message);
      return;
    }

    mainWindow = createMainWindow();

    /*
     * A cold start from a protocol link.
     *
     * On Windows, clicking `indexforge://benefits` while the app is closed
     * launches it with the URL in `process.argv` — `second-instance` never
     * fires, because this *is* the first instance. Reading only that event left
     * the link silently ignored and the window sitting on the home page, which
     * looks indistinguishable from the protocol not being registered at all.
     */
    const coldLink = deepLinkFrom(process.argv);
    const startAt = (coldLink && routeForDeepLink(coldLink)) || origin;

    await mainWindow.loadURL(startAt);
  });

  app.on("activate", () => showMain());

  app.on("before-quit", () => {
    quitting = true;
  });

  app.on("window-all-closed", () => {
    if (!IS_MAC) app.quit();
  });
}
