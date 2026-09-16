/**
 * Lets standalone Node processes import modules marked `server-only`.
 *
 * `server-only` throws on import outside a React Server Component. Its purpose
 * is a build-time assertion: it stops a *client* bundle from pulling in code
 * that touches the database or secrets. The worker, the seed, and the smoke
 * tests are all server-side by definition, so the guard has nothing to protect
 * there — but it still throws, which made the worker impossible to start.
 *
 * Stubbing it here keeps the protection where it matters (the Next build) while
 * letting a plain Node entry point run. Loaded with `--require`, so it patches
 * the loader before any application import resolves.
 */
const Module = require("node:module");

const load = Module._load;

Module._load = function (request, ...rest) {
  // tsx may hand over either the bare specifier or an already-resolved path.
  if (typeof request === "string" && request.includes("server-only")) return {};
  return load.call(this, request, ...rest);
};
