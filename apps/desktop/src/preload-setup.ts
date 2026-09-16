import { contextBridge, ipcRenderer } from "electron";

/**
 * Preload for the connection window only.
 *
 * This is deliberately not attached to the window that loads the dashboard.
 * That window renders content served by a remote origin, and handing remote
 * content a channel that can rewrite `serverUrl` would let whatever is on the
 * other end point the app somewhere else on its next launch. The dashboard
 * window gets no preload and no IPC at all; it is just a browser view.
 */
contextBridge.exposeInMainWorld("desktop", {
  current: (): Promise<{ serverUrl: string; reason: string | null }> =>
    ipcRenderer.invoke("connection:current"),

  /** Resolves to null on success, or a human-readable reason on failure. */
  connect: (serverUrl: string): Promise<string | null> =>
    ipcRenderer.invoke("connection:connect", serverUrl),

  cancel: (): void => ipcRenderer.send("connection:cancel"),
});
