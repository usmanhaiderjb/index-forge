# @aso/shared

Framework-free logic shared by the web app and (later) the Expo app.

## The rule

Nothing in here may import React, Next, a server module, the filesystem, or anything with a
runtime dependency on Prisma. **If it would need mocking to test in a plain Node process, it does
not belong here.**

`@prisma/client` may be imported **as a type only** (`import type`). That keeps the enum shapes in
sync without pulling the Prisma runtime into a React Native bundle.

## What is in it

| Module | Why it is shared |
| --- | --- |
| `date.ts` | The UTC date-only parsing fix. A second implementation would reintroduce the day-shift bug that made every store metric land a day early on hosts east of UTC. |
| `format.ts` | `METRIC_META` — label, unit, group, `higherIsBetter`, and `aggregation`. Whether a metric sums or averages must not be decided twice. |
| `tokens.ts` | The validated dataviz palette in JS. The web reads it from CSS; mobile has no CSS. |
| `locales.ts`, `slug.ts`, `utils.ts` | Small helpers with no framework ties. |
| `contact-schema.ts` | Zod schema shared between the form and the router, so client and server validation cannot drift. |

## What is deliberately not in it

- `blog.ts` — reads the filesystem, `server-only`.
- `csv.ts` — Play Console export parsing, a server concern.
- Anything under `src/server/` — precedence and derivation stay on the server because they query
  the database. Mobile consumes their *output* through tRPC, never a reimplementation.

## Consuming it

It ships raw TypeScript with no build step, which is why:

- `next.config.ts` lists it in `transpilePackages`
- `tsconfig.json` maps `@aso/shared` to `packages/shared/src/index.ts`
- `vitest.config.ts` carries the same alias
- the `Dockerfile` copies `packages/` for the worker, which resolves it at runtime

A future `apps/mobile` adds it as a workspace dependency and needs the equivalent Metro config.

## Keeping the palette in sync

`tokens.ts` and the custom properties in `src/app/globals.css` hold the same values in two places —
unavoidable, since one is CSS and the other is JS. **Change them together.** The series colours are
chosen for colour-blind distinguishability and contrast on both backgrounds; substituting one is
not a cosmetic change.
