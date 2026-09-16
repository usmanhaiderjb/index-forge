# Multi-stage build producing one image that runs either process.
#
#   web:    node server.js            (Next.js standalone output)
#   worker: node_modules/.bin/tsx src/worker/index.ts
#
# One image rather than two because they share the same source, the same Prisma
# client and the same env contract — two images would drift the moment someone
# rebuilt only one of them.

# ---------------------------------------------------------------- dependencies
FROM node:22-alpine AS deps
WORKDIR /app

# libc6-compat: Prisma's engines are glibc-linked and need the shim on Alpine.
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
COPY prisma ./prisma
# Workspace manifests must exist before `npm ci`, or it fails resolving the
# `packages/*` globs declared in the root package.json.
COPY packages/shared/package.json ./packages/shared/package.json
# `npm ci` runs the Prisma postinstall, which needs the schema — hence the copy
# above. Without it the client is generated later and the layer cache is wasted.
RUN npm ci

# ---------------------------------------------------------------------- build
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The build imports src/env, which validates. There are no secrets in an image
# build, so validation is skipped here and enforced at container start instead.
ENV SKIP_ENV_VALIDATION=1
ENV NEXT_TELEMETRY_DISABLED=1

# `metadataBase` is resolved at build time for every statically prerendered
# page, so this value is baked into the canonical and og:image URLs of the
# marketing site. Building without it ships pages that point at localhost.
#
#   docker build --build-arg APP_URL=https://aso.example.com -t aso .
#
# It is not a secret — it is the public address of the deployment.
ARG APP_URL=http://localhost:3000
ENV APP_URL=${APP_URL}

RUN npm run build

# --------------------------------------------------------------------- runtime
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Never run as root. Numeric ids so a k8s runAsUser check can match them.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Next standalone output carries only the modules the server actually imports.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# The worker is not part of the Next build, so it needs the sources, the full
# dependency tree, tsx, and the Prisma schema for `migrate deploy`.
COPY --from=build --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/src ./src
COPY --from=build --chown=nextjs:nodejs /app/scripts ./scripts
# The worker resolves @aso/shared at runtime through the workspace symlink in
# node_modules, so the package sources have to be present. The web process does
# not need them — Next inlines the package via transpilePackages.
COPY --from=build --chown=nextjs:nodejs /app/packages ./packages
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/content ./content
COPY --from=build --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs
EXPOSE 3000

# Overridden to the worker command in the worker service. See DEPLOYMENT.md.
CMD ["node", "server.js"]
