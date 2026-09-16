# Deployment

A costed plan for getting IndexForge into production on a startup budget, and the
reasoning behind the choice so you can change it deliberately later.

> Prices below are approximate and were checked against list pricing at the time
> of writing. Verify before you commit — every one of these providers changes
> pricing.

---

## 1. The constraint that decides everything

Four things must run:

| Process | Shape | Notes |
| --- | --- | --- |
| Next.js web | Long-lived HTTP | Serves the dashboard, tRPC, REST, OAuth callbacks |
| BullMQ worker | Long-lived, no port | Store scrapes, syncs, alert evaluation, AI jobs |
| Postgres | Stateful | Every metric, connection, keyword and review |
| Redis | Stateful | BullMQ queue **and** rate limiting |

The worker is what rules out a serverless-only deployment. It holds a blocking
connection to Redis and runs jobs that take longer than any function timeout —
a Play Store scrape across several storefronts is not a 10-second job. Vercel,
Netlify and Cloudflare Workers can host the *web* half perfectly well and cannot
host the worker at all.

So any plan is either "one machine that runs everything" or "a platform that
supports a background worker type". The first is much cheaper.

---

## 2. Recommended: one small VPS, Docker Compose

**Roughly $6/month, all in, excluding AI usage.**

This repo already ships the whole thing: a multi-stage `Dockerfile` producing
Next's standalone output, and `docker-compose.prod.yml` wiring web, worker,
migrate, Postgres and Redis with health checks and correct ordering.

### What to buy

| Item | Spec | ~Monthly |
| --- | --- | --- |
| Hetzner CX22 (or CPX11) | 2 vCPU, 4 GB RAM, 40 GB SSD | $4.50 |
| Hetzner automated backups | +20% of server cost | $0.90 |
| Domain | `.com`, amortized | $1.00 |
| Cloudflare DNS | Free plan | $0 |
| Transactional email | Resend / Brevo free tier | $0 |
| **Infrastructure total** | | **~$6.40** |

Add Anthropic API usage on top — see §6.

4 GB is the number that matters. Postgres, Redis, Next and the worker in one
2 GB box will survive a demo and start OOM-killing under a real sync. If budget
is the binding constraint, drop to 2 GB knowingly and watch memory, rather than
discovering it during a scrape.

Hetzner is the cheapest credible option at this size. DigitalOcean and Linode
are roughly 2–3× for the same specs; if you prefer them, the plan is otherwise
identical.

### Why this over a platform

At this stage you have no traffic, no team and no revenue. Paying $25/month for
managed Postgres and a worker dyno buys convenience you can supply yourself with
`docker compose up` and a nightly `pg_dump`. Move to managed services when a
real customer makes downtime expensive — not before.

The honest cost: **you own backups, patching and uptime.** §7 is the minimum you
must actually do.

---

## 3. Step by step

### 3.1 Server

```bash
# On the VPS, as root
adduser aso && usermod -aG sudo aso
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin
usermod -aG docker aso
```

Lock SSH down before anything else — key-only, no root login, and a firewall
that exposes 22, 80 and 443 and nothing else. Postgres and Redis are not
published to the host by `docker-compose.prod.yml`; keep it that way.

```bash
ufw default deny incoming && ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
```

### 3.2 Secrets

```bash
cp .env.example .env.production
```

Generate the two that must be random, and never reuse them across environments:

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY
```

`ENCRYPTION_KEY` encrypts every stored third-party credential with AES-256-GCM.
**Rotating it invalidates every connected integration** — every user reconnects.
Back it up somewhere that is not the server.

Set at minimum:

```
NODE_ENV=production
APP_URL=https://aso.yourdomain.com
AUTH_URL=https://aso.yourdomain.com
AUTH_TRUST_HOST=true
DATABASE_URL=postgresql://aso:<strong-password>@postgres:5432/aso?schema=public
REDIS_URL=redis://redis:6379
CRON_SECRET=<random>
RUN_INLINE_WORKER=false
```

Note the hostnames are `postgres` and `redis` — the compose service names, not
`localhost`. And `RUN_INLINE_WORKER=false` because a dedicated worker container
is running; leaving it true makes the web process drain the queue too and
compete with itself.

Email is optional and off by default. To enable alert and contact-form delivery:

```
EMAIL_SERVER=smtp://resend:<api-key>@smtp.resend.com:587
EMAIL_FROM=alerts@yourdomain.com
```

(Both are now in `.env.example` with Resend and Brevo examples.)

### 3.3 First deploy

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

`migrate` runs `prisma migrate deploy` and exits; `web` and `worker` wait for it
to succeed, so nothing ever serves traffic against a schema it was not built
for.

**Do not run `prisma/seed.ts` against production.** It writes two invented apps
with fabricated metrics, reviews and keyword ranks. It exists for local
development and demos.

### 3.4 TLS

Caddy is the least work — it gets and renews certificates automatically:

```caddyfile
aso.yourdomain.com {
    reverse_proxy localhost:3000
}
```

HTTPS is not optional here. The mobile app requires it (App Store and Play both
refuse cleartext by default), Auth.js sets `Secure` cookies in production, and
the desktop client's connection check will report a certificate problem rather
than connect.

### 3.5 Scheduling

The worker processes jobs; something has to enqueue them on a schedule. On a
single host that is plain cron, which costs nothing:

```cron
*/30 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://aso.yourdomain.com/api/cron?job=tick
*/15 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://aso.yourdomain.com/api/cron?job=alerts
```

### 3.6 Verify

Work through the first-deploy checklist in `HANDOVER.md` §14. The short version:
`/api/health` returns 200, the worker drains a job, one integration connects and
writes real rows.

---

## 4. Alternatives, costed

| Option | ~Monthly | Worth it when |
| --- | --- | --- |
| **Hetzner + Compose** | **$6** | Now. Cheapest credible production setup. |
| Railway | $20–25 | You would rather pay than run a server. Four services: web, worker, Postgres, Redis. Genuinely low-friction. |
| Fly.io | $10–20 | You want multi-region later. Postgres is unmanaged — you still operate it. |
| Render | ~$28 | Web $7 + worker $7 + Postgres $6 + Key Value ~$10. Simple, not cheap. |
| Vercel + Neon + Upstash + worker VM | $20+ | Worst fit. You pay for three services and still run a VM for the worker. |

Railway is the one to take if you decide ops time is worth more than $20/month.
Everything else on that list costs more for no advantage at this size.

---

## 5. Traps that cost real money or real data

**Redis eviction policy.** BullMQ stores jobs as Redis keys. A managed Redis
configured as a *cache* — `allkeys-lru`, the common default — will silently
delete queued jobs under memory pressure. The compose file sets
`--maxmemory-policy noeviction` explicitly. If you move to a managed Redis,
check this first. It fails as "some syncs just never ran", which is very hard to
notice.

**Serverless Redis and BullMQ.** Upstash and similar charge per request. A
BullMQ worker holds blocking reads and polls continuously; it is not an
idle-until-used workload. A free tier measured in tens of thousands of commands
per day will be gone in hours, and the paid bill is worse than the $4 VPS you
were avoiding. Use a normal Redis.

**Postgres backups.** Postgres holds everything — metrics, connections,
keywords, reviews. Redis holds only in-flight jobs; losing it loses queued work
but no history. Back up Postgres. Treat Redis as disposable.

**The AI budget.** `AI_MONTHLY_TOKEN_BUDGET` caps output tokens per organization
per month and defaults to 2,000,000. It is the only thing standing between one
enthusiastic user and a surprising Anthropic bill. Set it deliberately.

**Scraper politeness.** `ASO_SCRAPE_DELAY_MS` defaults to 1200 ms and
`ASO_USER_AGENT` identifies you. Lowering the delay to speed up syncs is how you
get an IP blocked, and a blocked IP on a single-VPS deployment takes the whole
product down.

---

## 6. Ongoing cost you cannot fix with hosting

**Anthropic API.** Every AI feature — recommendations, review sentiment,
screenshot analysis — is billed usage. Budget $10–30/month while small and watch
`AiUsage`. `ANTHROPIC_MODEL_BULK` exists precisely so per-review classification,
which is thousands of short calls, runs on a cheaper model than the long-form
recommendations.

**Google Ads developer token.** Free, but requires a Google Ads manager account
and an approval process. Start it early; it is not instant.

**Apple Developer Program.** $99/year, and only if you ship the iOS app or want
a signed macOS desktop build. Not needed for the web product.

**Code signing for Windows.** An OV certificate is roughly $100–200/year and
removes the SmartScreen warning on the desktop installer. Skip it until you are
distributing the desktop app to people who are not you.

---

## 7. The minimum operations you must actually do

Everything below is what "you own the server" cashes out to.

**Nightly Postgres backup, off the machine.** A backup on the same disk is not a
backup.

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U aso aso | gzip > /backups/aso-$(date +%F).sql.gz
```

Ship it somewhere else — Backblaze B2 is pennies at this size, a Hetzner Storage
Box is ~$4/month. **Then restore one, once.** An untested backup is a guess.

**Uptime monitoring.** Point a free monitor (UptimeRobot, Better Stack free
tier) at `/api/health`. It returns 503 when Postgres or Redis is down, so it
reports real readiness rather than "the process is up".

**Unattended security updates.** `apt install unattended-upgrades`.

**Log rotation.** Docker's default `json-file` driver grows without limit and
will fill a 40 GB disk. Set `max-size` and `max-file` in `/etc/docker/daemon.json`.

---

## 8. Known gaps in this plan

Stated plainly rather than discovered later.

**The image now builds and the full stack runs.** Verified on Windows 11 with
Docker Desktop 4.87 / Engine 29.7.2:

- `docker build` succeeds. Final image **350 MB**.
- Build context is **1.84 MB** — see `.dockerignore`, without which it was 5.6 GB
  and the build was broken outright.
- `prisma generate` and `npm ci` both succeed on `node:22-alpine`. The
  glibc/`libc6-compat` question is settled.
- `docker compose -f docker-compose.prod.yml up -d` brings up the whole stack:
  Postgres healthy, Redis healthy, `migrate` exits 0 with *All migrations have
  been successfully applied*, `worker` logs
  `[worker] listening on "aso" concurrency=4 env=production`, and `web` passes
  its health check.
- `/api/health` returns `{"ok":true}` with both dependencies up. `/`, `/blog`
  and `/about` all return 200 from the container.
- The `APP_URL` build argument reaches the rendered HTML: `<link rel="canonical">`
  and `og:url` both carry the value passed at build time.

**Three problems were found and fixed by doing this,** none of which a host build
could have surfaced:

*No `.dockerignore` existed.* `COPY . .` in the build stage runs **after** the
deps stage's `node_modules` is copied in, so a host `node_modules` built on
Windows or macOS overwrote the Alpine one — Prisma engines, esbuild and sharp are
all platform-specific binaries. It also baked `.env` into an image layer and
dragged 5.6 GB of context (3.4 GB `node_modules`, 1.3 GB of Gradle output under
`apps/mobile/android`, 471 MB `.next`, 357 MB of desktop installers, and the live
`.localdb` Postgres data directory).

*`public/` did not exist,* and Dockerfile line 57 copies it unconditionally.
`COPY /app/public ./public` aborts the build when the source is absent.

*`APP_URL` was undefined during the image build.* `src/env.ts` sets
`skipValidation` when `SKIP_ENV_VALIDATION` is on, and skipping validation
bypasses zod **entirely** — including the schema's own default. So `env.APP_URL`
was typed `string` while actually being `undefined`, and `new URL(env.APP_URL)`
in the root layout failed the build with `ERR_INVALID_URL` on `/_not-found`. A
host build never hit it because `.env` supplied the value. The fallback now lives
in `runtimeEnv` where skipping cannot bypass it, and — because `metadataBase` is
resolved at build time for statically prerendered pages — `APP_URL` is also a
build argument, required by `docker-compose.prod.yml`. Without that, a
production image would ship canonical and `og:image` URLs pointing at localhost.

**One thing not yet exercised:** the stack was verified against an empty
database. No integration has been connected inside a container, so the store
connectors remain untested against live accounts either way.

**No CI.** Nothing runs the test suite or a build on push. `.github/workflows/`
currently holds only the desktop installer workflow. Adding typecheck + `npm
test` on push is an hour of work and worth doing before the first deploy.

**None of the five store connectors has touched a live account.** They are
written and typed against the real API shapes but have only ever run against
fixtures. The Play Store HTML scraper is the most likely to need iteration —
Google reshuffles that payload without notice, which is why the parser locates
fields by shape rather than by a fixed path.

---

## 9. When to leave this setup

Concrete triggers, so the decision is not vibes:

- **Postgres backup/restore takes longer than you can be down** → managed
  Postgres (Neon, Hetzner-hosted, RDS).
- **One worker cannot keep up with sync schedules** →
  `--scale worker=3`. BullMQ distributes across every worker on the queue, so
  this needs no code change. Beyond one host, move the worker to its own machine
  pointed at the same Redis.
- **Downtime during a deploy starts costing you a customer** → a second web
  container behind the proxy, or a platform that does rolling deploys.
- **You are spending more than an hour a month on the server** → Railway. That
  hour is worth more than $20.
