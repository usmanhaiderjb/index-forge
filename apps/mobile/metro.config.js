const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

/**
 * Metro in a monorepo.
 *
 * Two changes are required and both are easy to miss:
 *
 * 1. `watchFolders` must include the workspace packages, or edits to
 *    packages/shared never trigger a reload — the app silently runs stale
 *    shared code.
 * 2. `nodeModulesPaths` must list both the app's and the root's node_modules,
 *    because npm hoists most dependencies to the root and Metro does not walk
 *    up the tree the way Node's resolver does.
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

/**
 * Deliberately NOT `[workspaceRoot]`.
 *
 * The repo root holds the local Postgres data directory, the Memurai install
 * and the Next.js build output. Watching it means Metro crawls tens of
 * thousands of files that no bundle can ever reach, and — because the Postgres
 * WAL is being written to continuously and parts of it are not readable —
 * the native watcher never reaches a ready state. It fails with
 * "Failed to start watch mode" after four minutes, `fileMap.build()` rejects,
 * and every later resolution dies on an undefined resolution cache. The bundle
 * request then returns a 500 that names DependencyGraph.js rather than
 * anything to do with the watcher.
 *
 * These two folders are everything the app can actually import.
 */
config.watchFolders = [
  path.resolve(workspaceRoot, "packages"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Without this, a hoisted copy and a nested copy of the same package can both
// be bundled — which for React shows up as the "invalid hook call" error.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
