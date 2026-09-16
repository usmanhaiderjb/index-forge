import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * Persisted settings.
 *
 * The desktop app is a client, not a server: the dashboard it shows is served
 * by the IndexForge web app, which owns the database and the job queue. So the one
 * setting that matters is where that server lives.
 */

export const DEFAULT_SERVER_URL = "http://localhost:3000";

export type Bounds = { x?: number; y?: number; width: number; height: number };

export type Settings = {
  serverUrl: string;
  bounds: Bounds;
  maximized: boolean;
};

const DEFAULTS: Settings = {
  serverUrl: DEFAULT_SERVER_URL,
  bounds: { width: 1280, height: 860 },
  maximized: false,
};

function file(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

/**
 * Only http and https, and only a bare origin.
 *
 * This value is written by the settings window and then handed straight to
 * `loadURL`, so it is the one place a bad string turns into "the app loads
 * something it should not". `file:` would read the local disk into a window
 * that shares a session with the real app; `javascript:` would execute. Parsing
 * with the URL constructor and then keeping only the origin also drops any
 * path, query or fragment someone pasted in from a browser address bar.
 */
export function normalizeServerUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Bare host, the way people actually type it.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;

  return url.origin;
}

export function read(): Settings {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), "utf8")) as Partial<Settings>;
    const serverUrl = normalizeServerUrl(String(raw.serverUrl ?? "")) ?? DEFAULTS.serverUrl;

    // Width and height are fed to BrowserWindow. A NaN or a negative from a
    // hand-edited file produces a window that cannot be seen or closed.
    const width = Number(raw.bounds?.width);
    const height = Number(raw.bounds?.height);

    return {
      serverUrl,
      bounds: {
        x: Number.isFinite(Number(raw.bounds?.x)) ? Number(raw.bounds?.x) : undefined,
        y: Number.isFinite(Number(raw.bounds?.y)) ? Number(raw.bounds?.y) : undefined,
        width: Number.isFinite(width) && width >= 640 ? width : DEFAULTS.bounds.width,
        height: Number.isFinite(height) && height >= 480 ? height : DEFAULTS.bounds.height,
      },
      maximized: Boolean(raw.maximized),
    };
  } catch {
    return { ...DEFAULTS, bounds: { ...DEFAULTS.bounds } };
  }
}

export function write(next: Partial<Settings>): Settings {
  const merged = { ...read(), ...next };
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(merged, null, 2), "utf8");
  } catch {
    // A settings file that cannot be written is not worth killing the app for.
    // The session still works; it just will not be remembered.
  }
  return merged;
}
